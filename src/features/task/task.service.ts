import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/client";
import {
  CreateTaskInput,
  ReminderTaskType,
  DecisionTaskType,
  MotivationTaskType,
  TaskType,
  GetAllTasksHelpers,
  AdviceTaskType,
} from "./task.types";
import { HttpStatus } from "../../types/httpStatus";
import { schedulePush } from "../../utils/scheduleReminderPush";
import {
  createTaskHelperNotifications,
  createDecisionTaskDoneNotifications,
} from "../notification/notification.service";

/* -------------------------------------------------------
   INTERNAL UTILS
--------------------------------------------------------- */

async function checkDuplicateTask(text: string, userId: string, excludeId?: string) {
  return prisma.task.findFirst({
    where: {
      text,
      userId,
      NOT: excludeId ? { id: excludeId } : undefined,
    },
  });
}

function hasHelpers(
  input: CreateTaskInput
): input is ReminderTaskType | AdviceTaskType | MotivationTaskType | DecisionTaskType {
  return "helpers" in input && Array.isArray(input.helpers);
}

/* -------------------------------------------------------
   CREATE TASK (auth required)
--------------------------------------------------------- */

export async function createTask(input: CreateTaskInput) {
  const { text, userId, type } = input;

  const existing = await checkDuplicateTask(text, userId);
  if (existing) {
    throw new AppError("You already created this task.", HttpStatus.CONFLICT);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, photo: true, fcmToken: true },
  });

  if (!user) {
    throw new AppError("User not found.", HttpStatus.FORBIDDEN);
  }

  const avatar = input.avatar ?? user.photo ?? undefined;
  const name = user.name;

  const remindAt = type === "reminder" ? (input as ReminderTaskType).remindAt : undefined;
  const options = type === "decision" ? input.options ?? [] : [];
  const deliverAt = type === "motivation" ? (input as MotivationTaskType).deliverAt ?? undefined : undefined;

  const helpers =
    hasHelpers(input) && input.helpers?.length
      ? { connect: input.helpers.map((id) => ({ id })) }
      : undefined;

  const createdTask = await prisma.task.create({
    data: {
      text,
      type,
      userId,
      avatar,
      name,
      remindAt,
      options,
      deliverAt,
      helpers,
    },
    include: { helpers: true },
  });

  /* ---------------------------
     Schedule reminder push
  ----------------------------- */
  if (type === "reminder" && remindAt && user.fcmToken) {
    const delayMs = new Date(remindAt).getTime() - Date.now();
    if (delayMs > 0) {
      schedulePush(delayMs, user.fcmToken, "⏰ Reminder", `It's time: "${text}"`);
    }
  }

  /* ---------------------------
     Notify helpers immediately
  ----------------------------- */
  if (hasHelpers(input) && input.helpers?.length) {
    const helperUsers = await prisma.user.findMany({
      where: { id: { in: input.helpers } },
      select: { id: true, fcmToken: true },
    });

    const bodyMap: Record<TaskType, string> = {
      reminder: `You were asked to help with a reminder: “${text}”`,
      advice: `Someone needs your advice: “${text}”`,
      motivation: `You were asked to motivate someone: “${text}”`,
      decision: `Someone needs your input: “${text}”`,
    };

    await Promise.all(
      helperUsers.map((helper) =>
        helper.fcmToken
          ? schedulePush(0, helper.fcmToken, "🤝 Someone asked for your help", bodyMap[type])
          : undefined
      )
    );

    await createTaskHelperNotifications({
      helperIds: input.helpers,
      senderId: userId,
      taskId: createdTask.id,
      taskText: text,
    });
  }

  return createdTask;
}

/* -------------------------------------------------------
   UPDATE TASK
--------------------------------------------------------- */

export async function updateTask(id: string, data: Partial<CreateTaskInput>) {
  const currentTask = await prisma.task.findUnique({
    where: { id },
    select: { userId: true, type: true },
  });

  if (!currentTask) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (data.text) {
    const duplicate = await checkDuplicateTask(data.text, currentTask.userId, id);
    if (duplicate) {
      throw new AppError("Duplicate task text.", HttpStatus.CONFLICT);
    }
  }

  const isHelperType = ["reminder", "motivation", "advice", "decision"].includes(currentTask.type);

  const dataToUpdate: any = {
    text: data.text,
    name: data.name,
    type: data.type,
    remindAt: data.type === "reminder" ? data.remindAt : undefined,
    options: data.type === "decision" ? data.options ?? [] : [],
    deliverAt: data.type === "motivation" ? data.deliverAt : undefined,
    avatar: data.avatar,
    ...(isHelperType && "helpers" in data
      ? { helpers: { set: data.helpers?.map((id) => ({ id })) ?? [] } }
      : {}),
  };

  return prisma.task.update({
    where: { id },
    data: dataToUpdate,
    include: { helpers: true },
  });
}

/* -------------------------------------------------------
   GET SINGLE TASK (optional auth)
--------------------------------------------------------- */

export async function getTaskById(taskId: string, userId?: string | null) {
  // ---------------------------------
  // 🔥 Increment view count (non-blocking)
  // ---------------------------------
  prisma.task.update({
    where: { id: taskId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {}); // prevent any crash from slowing down response

  // ---------------------------------
  // Fetch task with relations
  // ---------------------------------
  const task = await prisma.task.findUnique({
  where: { id: taskId },
  include: {
    helpers: { select: { id: true, name: true, photo: true } },
    Vote: {
      include: {
        user: { select: { id: true, name: true, photo: true } },
      },
    },
    _count: { select: { Push: true } },
    Push: userId
      ? { where: { userId }, select: { id: true } }
      : false,
  },
});

  if (!task) throw new AppError("Task not found", HttpStatus.NOT_FOUND);

  // ---------------------------------
  // Voting logic
  // ---------------------------------
  const votes = task.Vote.reduce((acc, v) => {
    if (!acc[v.option]) acc[v.option] = { count: 0, preview: [] };
    acc[v.option].count += 1;
    if (acc[v.option].preview.length < 3) {
      acc[v.option].preview.push({
        id: v.user.id,
        name: v.user.name,
        photo: v.user.photo ?? "",
      });
    }
    return acc;
  }, {} as Record<string, { count: number; preview: { id: string; name: string; photo: string }[] }>);

  const votedOption = userId
    ? task.Vote.find((v) => v.userId === userId)?.option ?? null
    : null;

  const { Vote, ...taskData } = task;

  // ---------------------------------
  // Include viewCount in response
  // ---------------------------------
  return {
    ...taskData,
    votes,
    votedOption,
    viewCount: task.viewCount, // 👈 ADD THIS
     pushCount: task.type === "motivation" ? task._count.Push : 0,
  hasPushed:
    userId && task.type === "motivation"
      ? task.Push?.length > 0
      : false,
  };
}

/* -------------------------------------------------------
   GET ALL TASKS (optional auth → public feed)
--------------------------------------------------------- */

export async function getAllTasks(userId?: string | null, helpers?: GetAllTasksHelpers) {
  /* ---------------------------------------------
     If logged in → show "following" feed
     If logged out → show ALL public posts
  ----------------------------------------------- */
  let taskFilterUserIds: string[] | undefined;

  if (userId) {
    const followings = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    taskFilterUserIds = followings.map((f) => f.followingId);
    if (!helpers?.excludeSelf) taskFilterUserIds = [userId, ...taskFilterUserIds];
  }

const tasks = await prisma.task.findMany({
  where: userId ? { userId: { in: taskFilterUserIds } } : {},
  include: {
    helpers: { select: { id: true, name: true, email: true, photo: true } },
    _count: true,
    Push: userId
      ? {
          where: { userId },
          select: { id: true },
        }
      : false,
  },
  orderBy: { createdAt: "desc" },
  take: helpers?.limit,
});

  const taskIds = tasks.map((t) => t.id);

  /* ---------------------------------------------
     Only logged-in users have reminder info
  ----------------------------------------------- */
  const remindedTaskIds = new Set<string>();

  if (userId) {
    const reminders = await prisma.reminderNote.findMany({
      where: { senderId: userId },
      select: { taskId: true },
    });

    reminders.forEach((r) => remindedTaskIds.add(r.taskId));
  }

  /* ---------------------------------------------
     Voting map (public)
  ----------------------------------------------- */

  const allVotes = await prisma.vote.findMany({
    where: { taskId: { in: taskIds } },
    select: {
      taskId: true,
      option: true,
      user: { select: { id: true, name: true, photo: true } },
    },
  });

  const voteMap: Record<
    string,
    Record<string, { count: number; voters: { id: string; name: string; photo?: string }[] }>
  > = {};

  for (const { taskId, option, user } of allVotes) {
    if (!voteMap[taskId]) voteMap[taskId] = {};
    if (!voteMap[taskId][option]) voteMap[taskId][option] = { count: 0, voters: [] };
    voteMap[taskId][option].count++;
    voteMap[taskId][option].voters.push({ ...user, photo: user.photo ?? undefined });
  }

  /* ---------------------------------------------
     User vote map (only if logged in)
  ----------------------------------------------- */
  const userVoteMap: Record<string, string> = {};

  if (userId) {
    const userVotes = await prisma.vote.findMany({
      where: { userId, taskId: { in: taskIds } },
      select: { taskId: true, option: true },
    });

    userVotes.forEach(({ taskId, option }) => {
      userVoteMap[taskId] = option;
    });
  }

  /* ---------------------------------------------
     FINAL TRANSFORMATION
  ----------------------------------------------- */

  return tasks.map((task) => {
    const t = task as typeof task & {
      _count: {
        comments: number;
        ReminderNote: number;
        Vote: number;
        helpers: number;
        Push: number;
      };
    };

    const { _count, ...cleanTask } = t; // 👈 REMOVE _count from output

    const taskVotes = voteMap[t.id] || {};

    const transformedVotes = Object.fromEntries(
      Object.entries(taskVotes).map(([opt, v]) => [
        opt,
        { count: v.count, preview: v.voters.slice(0, 4) },
      ])
    );

    return {
      ...cleanTask,

      commentsCount: t._count.Comment,
      reminderNoteCount: t._count.ReminderNote,
      voteCount: t._count.Vote,
      helpersCount: t._count.helpers,

      // 🔥 PUSH (only meaningful for motivation)
      pushCount: t.type === "motivation" ? t._count.Push : 0,
      hasPushed:
        userId && t.type === "motivation"
          ? task.Push?.length > 0
          : false,

      hasReminded: userId ? remindedTaskIds.has(t.id) : false,

      votes: transformedVotes,
      votedOption: userId ? userVoteMap[t.id] ?? null : null,
    };
  });
}
/* -------------------------------------------------------
   DELETE TASK
--------------------------------------------------------- */

export async function deleteTask(id: string) {
  const existing = await prisma.task.findUnique({ where: { id } });

  if (!existing) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  await prisma.vote.deleteMany({ where: { taskId: id } });

  return prisma.task.delete({ where: { id } });
}

/* -------------------------------------------------------
   COMPLETE / UNCOMPLETE TASK
--------------------------------------------------------- */

export async function markTaskAsDone(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { helpers: { select: { id: true } } },
  });

  if (!task) throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  if (task.userId !== userId)
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);

  if (task.type === "decision" && task.helpers.length > 0) {
    const helperIds = task.helpers.map((h) => h.id);

    const helpers = await prisma.user.findMany({
      where: { id: { in: helperIds } },
      select: { fcmToken: true },
    });

    await Promise.all(
      helpers.map((h) =>
        h.fcmToken
          ? schedulePush(
              0,
              h.fcmToken,
              "✅ Decision Finalized",
              `A decision you helped with is complete.`
            )
          : undefined
      )
    );

    await createDecisionTaskDoneNotifications({
      helperIds,
      senderId: userId,
      taskId: task.id,
      taskText: task.text,
    });
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { completed: true, completedAt: new Date() },
  });
}

export async function markTaskAsNotDone(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task) throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  if (task.userId !== userId)
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);

  return prisma.task.update({
    where: { id: taskId },
    data: { completed: false, completedAt: null },
  });
}


export async function getTaskViewCount(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { viewCount: true },
  });

  return task?.viewCount ?? null;
}

export async function increaseTaskViewCount(taskId: string) {
  await prisma.task.update({
    where: { id: taskId },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}