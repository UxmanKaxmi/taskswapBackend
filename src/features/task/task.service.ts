import { prisma } from "../../db/client";

interface TaskType {
  text: string;
  type: "reminder" | "decision" | "motivation" | "advice";
  userId: string;
  remindAt?: Date;
  options?: string[];
  deliverAt?: Date;
}

export async function createTask({
  text,
  type,
  userId,
  remindAt,
  options,
  deliverAt,
}: TaskType) {
  const existing = await prisma.task.findFirst({
    where: {
      text,
      userId,
    },
  });

  if (existing) {
    throw new Error("You already created this task.");
  }

  return prisma.task.create({
    data: { text, type, userId, remindAt, options, deliverAt },
  });
}

export function getAllTasks(userId: string) {
  return prisma.task.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export function updateTask(
  id: string,
  data: {
    text?: string;
    type?: TaskType;
    remindAt?: Date;
    options?: string[];
    deliverAt?: Date;
  }
) {
  return prisma.task.update({
    where: { id },
    data: {
      text: data.text,
      remindAt: data.remindAt,
      options: data.options,
      deliverAt: data.deliverAt,
      ...(data.type && { type: data.type as any }), // ✅ Cast type using EnumTaskTypeFieldUpdateOperationsInput
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
