import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/client";
import { Prisma } from "@prisma/client";
import {
  CreateTaskInput,
  ReminderTaskType,
  DecisionTaskType,
  MotivationTaskType,
  TaskType,
  GetAllTasksHelpers,
  FeedSort,
  AdviceTaskType,
  FeelingTag,
} from "./task.types";
import { HttpStatus } from "../../types/httpStatus";
import { schedulePush } from "../../utils/scheduleReminderPush";
import {
  getDecisionFinalizedNotificationText,
  getHelperNotificationText,
  getTaskReminderPushNotificationText,
} from "../../utils/notificationTextCatalog";
import {
  createTaskHelperNotifications,
  createDecisionTaskDoneNotifications,
  createTaskProgressUpdateNotifications,
} from "../notification/notification.service";
import { scheduleSeededPushesForTask } from "../seededPush/seededPush.service";
import { getTaskCheerSummaryForTask } from "../cheer/cheer.service";

type FeedTask = {
  id: string;
  text: string;
  type: TaskType;
  createdAt: Date;
  userId: string;
  remindAt: Date | null;
  options: string[];
  deliverAt: Date | null;
  avatar: string;
  name: string;
  feeling: FeelingTag | null;
  completed: boolean;
  completedAt: Date | null;
  isPublic: boolean;
  viewCount: number;
  helpers: {
    id: string;
    name: string;
    email: string;
    photo: string | null;
  }[];
  _count: {
    Comment: number;
    ReminderNote: number;
    Vote: number;
    helpers: number;
    Push: number;
  };
  Push?: { id: string }[];
};

type TaskProgressUpdateSummary = {
  text: string;
  createdAt: string;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const PROGRESS_UPDATE_COOLDOWN_MS =
  process.env.NODE_ENV === "production" ? 6 * HOUR_MS : MINUTE_MS;

type TaskPushHistoryItem = {
  createdAt: Date;
  user: {
    id: string;
    name: string;
    photo: string | null;
  };
};

/* -------------------------------------------------------
   INTERNAL UTILS
--------------------------------------------------------- */

function validateDecisionOptions(options?: string[]) {
  if (!options || options.length < 2) {
    throw new AppError(
      "Decision tasks must have at least two options.",
      HttpStatus.BAD_REQUEST
    );
  }

  const normalized = options.map((o) => o.trim().toLowerCase());
  const unique = new Set(normalized);

  if (unique.size !== normalized.length) {
    throw new AppError(
      "Decision options must be unique.",
      HttpStatus.BAD_REQUEST
    );
  }
}

function toProgressUpdateSummary(
  progressUpdate: { text: string; createdAt: Date } | null | undefined
): TaskProgressUpdateSummary | null {
  if (!progressUpdate) return null;

  return {
    text: progressUpdate.text,
    createdAt: progressUpdate.createdAt.toISOString(),
  };
}

function getProgressUpdateCooldownMessage(remainingMs: number) {
  if (PROGRESS_UPDATE_COOLDOWN_MS < HOUR_MS) {
    const remainingMinutes = Math.ceil(remainingMs / MINUTE_MS);
    return `You can only share a progress update every 1 minute. Try again in about ${remainingMinutes} minute${
      remainingMinutes === 1 ? "" : "s"
    }.`;
  }

  const remainingHours = Math.ceil(remainingMs / HOUR_MS);
  return `You can only share a progress update every 6 hours. Try again in about ${remainingHours} hour${
    remainingHours === 1 ? "" : "s"
  }.`;
}



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

async function transformTasksForFeed(tasks: FeedTask[], userId?: string | null) {
  const taskIds = tasks.map((t) => t.id);
  const viewerId = userId ?? null;

  if (taskIds.length === 0) {
    return [];
  }

  const remindedTaskIds = new Set<string>();

  if (viewerId) {
    const reminders = await prisma.reminderNote.findMany({
      where: { senderId: viewerId, taskId: { in: taskIds } },
      select: { taskId: true },
    });

    reminders.forEach((r) => remindedTaskIds.add(r.taskId));
  }

  const advisedTaskIds = new Set<string>();

  if (viewerId) {
    const adviceComments = await prisma.comment.findMany({
      where: {
        userId: viewerId,
        taskId: { in: taskIds },
        task: { type: "advice" },
      },
      select: { taskId: true },
    });

    adviceComments.forEach((c) => advisedTaskIds.add(c.taskId));
  }

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
    Record<
      string,
      { count: number; voters: { id: string; name: string; photo?: string }[] }
    >
  > = {};

  for (const { taskId, option, user } of allVotes) {
    if (!voteMap[taskId]) voteMap[taskId] = {};
    if (!voteMap[taskId][option]) voteMap[taskId][option] = { count: 0, voters: [] };
    voteMap[taskId][option].count++;
    voteMap[taskId][option].voters.push({ ...user, photo: user.photo ?? undefined });
  }

  const userVoteMap: Record<string, string> = {};

  if (viewerId) {
    const userVotes = await prisma.vote.findMany({
      where: { userId: viewerId, taskId: { in: taskIds } },
      select: { taskId: true, option: true },
    });

    userVotes.forEach(({ taskId, option }) => {
      userVoteMap[taskId] = option;
    });
  }

  return tasks.map((task) => {
    const { _count, ...cleanTask } = task;
    const taskVotes = voteMap[task.id] || {};

    const transformedVotes = Object.fromEntries(
      Object.entries(taskVotes).map(([opt, v]) => [
        opt,
        { count: v.count, preview: v.voters.slice(0, 4) },
      ])
    );

    return {
      ...cleanTask,
      commentsCount: task._count.Comment,
      reminderNoteCount: task._count.ReminderNote,
      voteCount: task._count.Vote,
      helpersCount: task._count.helpers,
      pushCount: task.type === "motivation" ? task._count.Push : 0,
      hasPushed:
        viewerId && task.type === "motivation" ? (task.Push?.length ?? 0) > 0 : false,
      hasAdvised:
        viewerId && task.type === "advice" ? advisedTaskIds.has(task.id) : false,
      hasReminded: viewerId ? remindedTaskIds.has(task.id) : false,
      votes: transformedVotes,
      votedOption: viewerId ? userVoteMap[task.id] ?? null : null,
      hasVoted: viewerId ? Boolean(userVoteMap[task.id]) : false,
    };
  });
}

type TaskFeedResponse = Awaited<ReturnType<typeof transformTasksForFeed>>;

type PaginatedTaskResult = {
  tasks: TaskFeedResponse;
  nextCursor: string | null;
  hasMore: boolean;
};

const FEED_SORTS = new Set<FeedSort>(["all", "needs_push", "new", "almost_there"]);

type FeedCursorRow = {
  id: string;
  created_at: Date;
  push_count: number;
  latest_activity_at: Date;
};

function normalizeFeedSort(sort?: string): FeedSort {
  return sort && FEED_SORTS.has(sort as FeedSort) ? (sort as FeedSort) : "needs_push";
}

function getFeedCursorCondition(sort: FeedSort, cursor?: FeedCursorRow | null) {
  if (!cursor) return Prisma.empty;

  switch (sort) {
    case "all":
    case "new":
      return Prisma.sql`
        AND (
          t."createdAt" < ${cursor.created_at}
          OR (t."createdAt" = ${cursor.created_at} AND t.id < ${cursor.id})
        )
      `;
    case "almost_there":
      return Prisma.sql`
        AND (
          t."latestActivityAt" < ${cursor.latest_activity_at}
          OR (t."latestActivityAt" = ${cursor.latest_activity_at} AND t.id < ${cursor.id})
        )
      `;
    case "needs_push":
    default:
      return Prisma.sql`
        AND (
          t."pushCount" > ${cursor.push_count}
          OR (t."pushCount" = ${cursor.push_count} AND t."createdAt" < ${cursor.created_at})
          OR (
            t."pushCount" = ${cursor.push_count}
            AND t."createdAt" = ${cursor.created_at}
            AND t.id < ${cursor.id}
          )
        )
      `;
  }
}

function getFeedOrderBy(sort: FeedSort) {
  switch (sort) {
    case "all":
    case "new":
      return Prisma.sql`t."createdAt" DESC, t.id DESC`;
    case "almost_there":
      return Prisma.sql`t."latestActivityAt" DESC, t.id DESC`;
    case "needs_push":
    default:
      return Prisma.sql`t."pushCount" ASC, t."createdAt" DESC, t.id DESC`;
  }
}

async function getFeedCursorRow(
  cursorId: string | undefined,
  excludeUserId?: string | null
): Promise<FeedCursorRow | null> {
  if (!cursorId) return null;

  const excludeSelfCondition = excludeUserId
    ? Prisma.sql`AND t."userId" <> ${excludeUserId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<FeedCursorRow[]>`
    SELECT
      t.id,
      t."createdAt" AS created_at,
      t."pushCount" AS push_count,
      t."latestActivityAt" AS latest_activity_at
    FROM "Task" t
    WHERE
      t.id = ${cursorId}
      AND t."isPublic" = true
      AND t.type = 'motivation'
      AND t.completed = false
      AND t."completedAt" IS NULL
      ${excludeSelfCondition}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getOrderedFeedTaskIds({
  sort,
  limit,
  cursorId,
  excludeUserId,
}: {
  sort: FeedSort;
  limit: number;
  cursorId?: string;
  excludeUserId?: string | null;
}) {
  const excludeSelfCondition = excludeUserId
    ? Prisma.sql`AND t."userId" <> ${excludeUserId}`
    : Prisma.empty;
  const almostThereCondition =
    sort === "almost_there" ? Prisma.sql`AND t."isAlmostThere" = true` : Prisma.empty;
  const cursor = await getFeedCursorRow(cursorId, excludeUserId);
  const cursorCondition = getFeedCursorCondition(sort, cursor);
  const orderBy = getFeedOrderBy(sort);

  return prisma.$queryRaw<{ id: string }[]>`
    SELECT t.id
    FROM "Task" t
    WHERE
      t."isPublic" = true
      AND t.type = 'motivation'
      AND t.completed = false
      AND t."completedAt" IS NULL
      ${almostThereCondition}
      ${excludeSelfCondition}
      ${cursorCondition}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;
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
  
  if (type === "decision") {
  validateDecisionOptions(input.options);
}

const options =
  type === "decision"
    ? input.options?.map((o) => o.trim()) ?? []
    : [];
    
  const deliverAt = type === "motivation" ? (input as MotivationTaskType).deliverAt ?? undefined : undefined;

  const helpers =
    hasHelpers(input) && input.helpers?.length
      ? { connect: input.helpers.map((id) => ({ id })) }
      : undefined;

  const createdTask = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        text,
        type,
        userId,
        isPublic: true,
        avatar,
        name,
        feeling: input.feeling ?? null,
        remindAt,
        options,
        deliverAt,
        helpers,
      },
      include: { helpers: true },
    });

    await tx.taskBeat.create({
      data: {
        taskId: task.id,
        type: "post",
        createdAt: task.createdAt,
      },
    });

    return task;
  });

  /* ---------------------------
     Schedule reminder push
  ----------------------------- */
  if (type === "reminder" && remindAt && user.fcmToken) {
    const delayMs = new Date(remindAt).getTime() - Date.now();
    if (delayMs > 0) {
      const { title, body } = getTaskReminderPushNotificationText(text);
      schedulePush(delayMs, user.fcmToken, title, body, {
        notificationType: "reminder",
        taskId: createdTask.id,
        taskType: "reminder",
        deeplinkPath: `/tasks/${createdTask.id}`,
        screen: "TaskDetail",
      });
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
    const helperNotificationText = getHelperNotificationText(type, text);

    await Promise.all(
      helperUsers.map((helper) =>
        helper.fcmToken
          ? schedulePush(
              0,
              helper.fcmToken,
              helperNotificationText.title,
              helperNotificationText.body,
              {
                notificationType: "task-helper",
                taskId: createdTask.id,
                taskType: type,
                deeplinkPath: `/tasks/${createdTask.id}`,
                screen: "TaskDetail",
              }
            )
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

  /* ---------------------------
     Schedule seeded launch pushes
  ----------------------------- */
  await scheduleSeededPushesForTask(createdTask.id);

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


  if (
  (data.type === "decision" || currentTask.type === "decision") &&
  "options" in data
) {
  validateDecisionOptions(data.options);
}

  const dataToUpdate: any = {
    text: data.text,
    name: data.name,
    type: data.type,
    feeling: data.feeling,
    remindAt: data.type === "reminder" ? data.remindAt : undefined,
    options:
  data.type === "decision"
    ? data.options?.map((o) => o.trim()) ?? []
    : [],
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
  // Fetch task with relations
  // ---------------------------------
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      helpers: { select: { id: true, name: true, photo: true } },
      progressUpdates: {
        orderBy: { createdAt: "desc" },
        select: {
          text: true,
          createdAt: true,
        },
      },
      Vote: {
        include: {
          user: { select: { id: true, name: true, photo: true } },
        },
      },
      _count: { select: { Push: true } },
      Push: userId
        ? {
            orderBy: { createdAt: "desc" },
            select: {
              createdAt: true,
              user: {
                select: { id: true, name: true, photo: true },
              },
            },
          }
        : false,
    },
  });

  if (!task || !task.isPublic) {
    throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  }

  // ---------------------------------
  // 🔥 Increment view count (non-blocking)
  // ---------------------------------
  prisma.task.update({
    where: { id: taskId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {}); // prevent any crash from slowing down response

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

  const hasVoted = userId ? votedOption !== null : false;
  const { Vote, progressUpdates, Push, ...taskData } = task;
  const progressUpdateHistory = progressUpdates
    .map((entry) => toProgressUpdateSummary(entry))
    .filter((entry): entry is TaskProgressUpdateSummary => entry !== null);

  // ---------------------------------
  // Include viewCount in response
  // ---------------------------------

  let hasAdvised = false;

  if (userId && task.type === "advice") {
    const advice = await prisma.comment.findFirst({
      where: {
        taskId,
        userId,
      },
      select: { id: true },
    });

    hasAdvised = !!advice;
  }

  let hasReminded = false;

  if (userId) {
    const reminder = await prisma.reminderNote.findFirst({
      where: {
        taskId,
        senderId: userId,
      },
      select: { id: true },
    });

    hasReminded = !!reminder;
  }

  const pushItems = Array.isArray(Push)
    ? (Push as unknown as TaskPushHistoryItem[])
    : [];
  const visiblePushItems = pushItems.filter((p) => p.user.id !== task.userId);
  const pushCount =
    task.type === "motivation"
      ? await prisma.push.count({
          where: {
            taskId,
            userId: { not: task.userId },
          },
        })
      : 0;

  const pushHistory =
    task.type === "motivation"
      ? visiblePushItems.map((p) => ({
          user: p.user,
          pushedAt: p.createdAt,
        }))
      : [];
  const cheerSummary =
    task.type === "motivation"
      ? await getTaskCheerSummaryForTask(taskId, userId)
      : {
          beats: [],
          cheerTotal: 0,
          distinctCheererCount: 0,
          sampleCheerers: [],
          mostCheeredBeatId: null,
        };

  return {
    ...taskData,
    votes,
    votedOption,
    viewCount: task.viewCount,
    hasVoted,
    pushCount,
    hasPushed:
      userId && task.type === "motivation"
        ? visiblePushItems.some((p) => p.user.id === userId)
        : false,
    pushHistory,
    beats: cheerSummary.beats,
    cheerTotal: cheerSummary.cheerTotal,
    distinctCheererCount: cheerSummary.distinctCheererCount,
    sampleCheerers: cheerSummary.sampleCheerers,
    mostCheeredBeatId: cheerSummary.mostCheeredBeatId,
    hasAdvised,
    hasReminded,
    progressUpdates: progressUpdateHistory,
  };
}

/* -------------------------------------------------------
   GET ALL TASKS (optional auth → public feed)
--------------------------------------------------------- */

export async function getAllTasks(
  userId?: string | null,
  helpers?: GetAllTasksHelpers
): Promise<PaginatedTaskResult> {
  const requestedLimit = helpers?.limit ?? 20;
  const normalizedLimit = Math.max(1, Math.min(requestedLimit, 50));
  const fetchLimit = normalizedLimit + 1;
  const sort = normalizeFeedSort(helpers?.sort);
  const cursorId = helpers?.cursor?.trim();
  const excludeUserId = helpers?.excludeSelf && userId ? userId : null;
  const orderedIds = await getOrderedFeedTaskIds({
    sort,
    limit: fetchLimit,
    cursorId,
    excludeUserId,
  });

  const hasMore = orderedIds.length === fetchLimit;
  const trimmedIds = hasMore ? orderedIds.slice(0, normalizedLimit) : orderedIds;
  const taskIds = trimmedIds.map((row) => row.id);
  const lastTaskId = taskIds[taskIds.length - 1] ?? null;

  if (taskIds.length === 0) {
    return {
      tasks: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      helpers: { select: { id: true, name: true, email: true, photo: true } },
      _count: {
        select: {
          Comment: true,
          ReminderNote: true,
          Vote: true,
          helpers: true,
          Push: true,
        },
      },
      Push: userId
        ? {
            where: { userId },
            select: { id: true },
          }
        : false,
    },
  });

  const taskOrder = new Map(taskIds.map((id, index) => [id, index]));
  const sortedTasks = tasks.sort((a, b) => {
    return (taskOrder.get(a.id) ?? 0) - (taskOrder.get(b.id) ?? 0);
  });
  const paginatedTasks = await transformTasksForFeed(sortedTasks as FeedTask[], userId);

  return {
    tasks: paginatedTasks,
    hasMore,
    nextCursor: hasMore ? lastTaskId : null,
  };
}

export async function getRecentTasksForUserProfile(
  targetUserId: string,
  currentUserId?: string | null,
  limit = 5
) {
  const recentTasks = await prisma.task.findMany({
    where: { userId: targetUserId },
    include: {
      helpers: { select: { id: true, name: true, email: true, photo: true } },
      _count: { select: { Comment: true, ReminderNote: true, Vote: true, helpers: true, Push: true } },
      Push: currentUserId
        ? {
            where: { userId: currentUserId },
            select: { id: true },
          }
        : false,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return transformTasksForFeed(recentTasks as FeedTask[], currentUserId);
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
    const decisionFinalizedNotificationText = getDecisionFinalizedNotificationText();

    await Promise.all(
      helpers.map((h) =>
        h.fcmToken
          ? schedulePush(
              0,
              h.fcmToken,
              decisionFinalizedNotificationText.title,
              decisionFinalizedNotificationText.body,
              {
                notificationType: "decision-done",
                taskId: task.id,
                taskType: "decision",
                deeplinkPath: `/tasks/${task.id}`,
                screen: "TaskDetail",
              }
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

export async function shareTaskProgress(
  taskId: string,
  senderId: string,
  text: string
): Promise<TaskProgressUpdateSummary> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      userId: true,
      type: true,
      text: true,
      name: true,
      completed: true,
      Push: {
        select: { userId: true },
      },
      helpers: {
        select: { id: true },
      },
      progressUpdates: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
        },
      },
    },
  });

  if (!task) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (task.type !== "motivation") {
    throw new AppError(
      "Progress updates are only available for motivation tasks.",
      HttpStatus.BAD_REQUEST
    );
  }

  if (task.completed) {
    throw new AppError(
      "Completed tasks cannot receive progress updates.",
      HttpStatus.CONFLICT
    );
  }

  if (task.userId !== senderId) {
    throw new AppError(
      "You can only share progress on your own task.",
      HttpStatus.FORBIDDEN
    );
  }

  const latestProgressUpdate = task.progressUpdates[0];
  if (latestProgressUpdate) {
    const elapsedMs = Date.now() - latestProgressUpdate.createdAt.getTime();
    if (elapsedMs < PROGRESS_UPDATE_COOLDOWN_MS) {
      const remainingMs = PROGRESS_UPDATE_COOLDOWN_MS - elapsedMs;
      throw new AppError(
        getProgressUpdateCooldownMessage(remainingMs),
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  const senderName = task.name.trim() || "Someone";
  const recipientIds = [
    ...new Set([
      ...task.Push.map((push) => push.userId),
      ...task.helpers.map((helper) => helper.id),
    ]),
  ].filter((recipientId) => recipientId !== senderId);

  const progressUpdate = await prisma.$transaction(async (tx) => {
    const update = await tx.progressUpdate.create({
      data: {
        taskId,
        senderId,
        text,
      },
    });

    await tx.taskBeat.create({
      data: {
        taskId,
        type: "update",
        updateId: update.id,
        createdAt: update.createdAt,
      },
    });

    await tx.task.update({
      where: { id: taskId },
      data: { latestActivityAt: update.createdAt },
    });

    return update;
  });

  await createTaskProgressUpdateNotifications({
    recipientIds,
    senderId,
    taskId,
    progressUpdateId: progressUpdate.id,
    taskText: task.text,
    progressText: text,
    taskType: task.type,
    senderName,
  });

  return toProgressUpdateSummary(progressUpdate)!;
}


export async function getTaskViewCount(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { viewCount: true, isPublic: true },
  });

  if (!task || !task.isPublic) {
    return null;
  }

  return task.viewCount;
}

export async function increaseTaskViewCount(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, isPublic: true },
  });

  if (!task || !task.isPublic) {
    return false;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}
