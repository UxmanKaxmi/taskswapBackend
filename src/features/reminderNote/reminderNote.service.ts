// src/features/reminderNote/reminderNote.service.ts

import { prisma } from "../../db/client";
import { BadRequestError } from "../../errors";
import { ReminderNoteDTO, SendReminderNoteInput } from "./reminderNote.types";

export async function sendReminderNote({
  taskId,
  senderId,
  message,
}: SendReminderNoteInput) {
  if (!message?.trim()) {
    throw new BadRequestError("Reminder message cannot be empty.");
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new BadRequestError("Task not found.");
  }

  if (task.userId === senderId) {
    throw new BadRequestError("You cannot remind yourself.");
  }

  const existing = await prisma.reminderNote.findFirst({
    where: {
      taskId,
      senderId,
    },
  });

  if (existing) {
    throw new BadRequestError("You already sent a reminder for this task.");
  }

  return prisma.reminderNote.create({
    data: {
      taskId,
      senderId,
      message,
    },
  });
}

export async function getRemindersByTask(
  taskId: string,
  userId: string | undefined
): Promise<ReminderNoteDTO[]> {
  const notes = await prisma.reminderNote.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });

  return notes.map((note) => ({
    id: note.id,
    taskId: note.taskId,
    senderId: note.senderId,
    message: note.message,
    createdAt: note.createdAt.toISOString(),
  }));
}
