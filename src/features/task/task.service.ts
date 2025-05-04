import { prisma } from "../../db/client";

type TaskPayload = {
  text: string;
  type: "reminder" | "poll" | "motivation" | "other";
  userId: string;
};

export async function createTask({ text, type, userId }: TaskPayload) {
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
    data: { text, type, userId },
  });
}

export function getAllTasks() {
  return prisma.task.findMany({
    orderBy: { createdAt: "desc" },
  });
}
