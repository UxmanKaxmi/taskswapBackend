import { prisma } from "../../db/client";
import {
  CreateTaskInput,
  ReminderTaskType,
  DecisionTaskType,
  MotivationTaskType,
} from "../../types/task.types";

export async function createTask(input: CreateTaskInput) {
  const { text, userId, type } = input;

  const existing = await prisma.task.findFirst({
    where: {
      text,
      userId,
    },
  });

  if (existing) {
    throw new Error("You already created this task.");
  }

  //  Fetch user's Google photo
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { photo: true, name: true },
  });
  if (!user) {
    throw new Error("User not found. Cannot create task without a valid user.");
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

export function updateTask(id: string, data: Partial<CreateTaskInput>) {
  return prisma.task.update({
    where: { id },
    data: {
      text: data.text,
      type: data.type,
      name: data.name,
      remindAt:
        data.type === "reminder" ? data.remindAt ?? undefined : undefined,
      options: data.type === "decision" ? data.options ?? [] : [],
      deliverAt:
        data.type === "motivation" ? data.deliverAt ?? undefined : undefined,
      avatar: data.avatar ?? undefined,
    },
  });
}

export async function deleteTask(id: string) {
  const existing = await prisma.task.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error("Task not found.");
  }

  return prisma.task.delete({
    where: { id },
  });
}
