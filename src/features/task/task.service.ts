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
import { createTaskHelperNotifications } from "../notification/notification.service";

async function checkDuplicateTask(
  text: string,
  userId: string,
  excludeId?: string
) {
  return prisma.task.findFirst({
    where: {
      text,
      userId,
      NOT: excludeId ? { id: excludeId } : undefined,
    },
  });
}

/**
 * Type guard to check if task input supports helpers
 */
function hasHelpers(
  input: CreateTaskInput
): input is ReminderTaskType | AdviceTaskType | MotivationTaskType {
  return "helpers" in input;
}

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
    throw new AppError(
      "User not found. Cannot create task without a valid user.",
      HttpStatus.FORBIDDEN
    );
  }

  const avatar = input.avatar ?? user.photo ?? undefined;
  const name = user.name;

  const remindAt =
    type === "reminder" ? (input as ReminderTaskType).remindAt : undefined;

  const options = type === "decision" ? input.options ?? [] : [];

  const deliverAt =
    type === "motivation"
      ? (input as MotivationTaskType).deliverAt ?? undefined
      : undefined;

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
    include: {
      helpers: true,
    },
  });

  // ✅ Schedule push for the task owner (reminders)
  if (type === "reminder" && remindAt) {
    const delayMs = new Date(remindAt).getTime() - Date.now();
    if (delayMs > 0 && user.fcmToken) {
      schedulePush(
        delayMs,
        user.fcmToken,
        "✅ Reminder Complete",
        `It’s time to act on your task: “${text}”`
      );
    }
  }

  // ✅ Notify helpers immediately
  if (hasHelpers(input) && input.helpers?.length) {
    const helperUsers = await prisma.user.findMany({
      where: { id: { in: input.helpers } },
      select: { id: true, fcmToken: true },
    });

    const title = "🤝 Someone needs your help";
    const bodyMap: Record<TaskType, string> = {
      reminder: `You’ve been asked to help with a reminder: “${text}”`,
      advice: `Someone needs your advice on: “${text}”`,
      motivation: `You’ve been invited to motivate someone on: “${text}”`,
      decision: "", // shouldn't happen
    };

    await Promise.all(
      helperUsers.map((helper) => {
        if (helper.fcmToken) {
          return schedulePush(0, helper.fcmToken, title, bodyMap[type]);
        }
      })
    );
  }
  // ✅ Add this now:
  if (hasHelpers(input) && input.helpers?.length) {
    await createTaskHelperNotifications({
      helperIds: input.helpers,
      senderId: userId,
      taskId: createdTask.id,
      taskText: text,
    });
  }

  return createdTask;
}

export async function updateTask(id: string, data: Partial<CreateTaskInput>) {
  const currentTask = await prisma.task.findUnique({
    where: { id },
    select: { userId: true, type: true }, // 👈 include type to validate helpers
  });

  if (!currentTask) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (data.text) {
    const duplicate = await checkDuplicateTask(
      data.text,
      currentTask.userId,
      id
    );
    if (duplicate) {
      throw new AppError(
        "You already have another task with the same text.",
        HttpStatus.CONFLICT
      );
    }
  }

  const isHelperType =
    currentTask.type === "reminder" ||
    currentTask.type === "motivation" ||
    currentTask.type === "advice";

  const dataToUpdate: any = {
    text: data.text,
    type: data.type,
    name: data.name,
    remindAt: data.type === "reminder" ? data.remindAt ?? undefined : undefined,
    options: data.type === "decision" ? data.options ?? [] : [],
    deliverAt:
      data.type === "motivation" ? data.deliverAt ?? undefined : undefined,
    avatar: data.avatar ?? undefined,
    ...(isHelperType && "helpers" in data
      ? {
          helpers: {
            set: data.helpers?.map((id) => ({ id })) ?? [],
          },
        }
      : {}),
  };

  return prisma.task.update({
    where: { id },
    data: dataToUpdate,
    include: {
      helpers: true,
    },
  });
}

export async function getAllTasks(
  userId: string,
  helpers?: GetAllTasksHelpers
) {
  // Step 1: Get IDs of people the user follows
  const followings = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  let userIds = followings.map((f) => f.followingId);
  if (!helpers?.excludeSelf) {
    userIds = [userId, ...userIds];
  }

  // Step 2: Get tasks by self + followed users
  const tasks = await prisma.task.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    include: {
      helpers: {
        select: {
          id: true,
          name: true,
          email: true,
          photo: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: helpers?.limit,
  });

  // Step 3: Get all reminder notes sent by current user
  const reminders = await prisma.reminderNote.findMany({
    where: { senderId: userId },
    select: { taskId: true },
  });

  const remindedTaskIds = new Set(reminders.map((r) => r.taskId));

  // Step 4: Mark each task if user has reminded it
  return tasks.map((task) => ({
    ...task,
    hasReminded: remindedTaskIds.has(task.id),
    helpers: task.helpers, // ✅ Include helpers in the final payload
  }));
}

export async function deleteTask(id: string) {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError("Task not found.", HttpStatus.FORBIDDEN);
  }

  return prisma.task.delete({
    where: { id },
  });
}

export async function markTaskAsDone(taskId: string, userId: string) {
  console.log("[LOOKUP] task ID:", taskId);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  }

  if (task.type !== "reminder") {
    throw new AppError(
      "Only reminder tasks can be marked as done",
      HttpStatus.BAD_REQUEST
    );
  }

  if (task.userId !== userId) {
    throw new AppError(
      "Unauthorized to mark this task",
      HttpStatus.UNAUTHORIZED
    );
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { completed: true },
  });
}

export async function markTaskAsNotDone(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  }

  if (task.type !== "reminder") {
    throw new AppError(
      "Only reminder tasks can be marked as done",
      HttpStatus.BAD_REQUEST
    );
  }

  if (task.userId !== userId) {
    throw new AppError(
      "Unauthorized to mark this task",
      HttpStatus.UNAUTHORIZED
    );
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { completed: false },
  });
}
