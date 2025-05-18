import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/client";
import {
  CreateTaskInput,
  ReminderTaskType,
  DecisionTaskType,
  MotivationTaskType,
} from "../../types/task.types";
import { HttpStatus } from "../../types/httpStatus";

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

export async function createTask(input: CreateTaskInput) {
  const { text, userId, type } = input;

  const existing = await checkDuplicateTask(text, userId);
  if (existing) {
    throw new AppError("You already created this task.", HttpStatus.CONFLICT);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { photo: true, name: true },
  });

  if (!user) {
    throw new AppError(
      "User not found. Cannot create task without a valid user.",
      HttpStatus.FORBIDDEN
    );
  }

  const avatar = input.avatar ?? user.photo ?? undefined;
  const name = user.name;

  return prisma.task.create({
    data: {
      text,
      type,
      userId,
      avatar,
      name,
      remindAt:
        type === "reminder" ? (input as ReminderTaskType).remindAt : undefined,
      options: type === "decision" ? (input as DecisionTaskType).options : [],
      deliverAt:
        type === "motivation"
          ? (input as MotivationTaskType).deliverAt ?? undefined
          : undefined,
    },
  });
}

export function getAllTasks(userId: string) {
  return prisma.task.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateTask(id: string, data: Partial<CreateTaskInput>) {
  const currentTask = await prisma.task.findUnique({
    where: { id },
    select: { userId: true },
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

  const dataToUpdate = {
    text: data.text,
    type: data.type,
    name: data.name,
    remindAt: data.type === "reminder" ? data.remindAt ?? undefined : undefined,
    options: data.type === "decision" ? data.options ?? [] : [],
    deliverAt:
      data.type === "motivation" ? data.deliverAt ?? undefined : undefined,
    avatar: data.avatar ?? undefined,
  };

  return prisma.task.update({
    where: { id },
    data: dataToUpdate,
  });
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
