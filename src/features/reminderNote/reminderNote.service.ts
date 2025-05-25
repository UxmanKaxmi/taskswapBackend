// src/features/reminderNote/reminderNote.service.ts

import { sendPushNotification } from "../../utils/sendPushNotification";
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
    select: {
      userId: true,
      text: true,
      user: {
        select: { fcmToken: true },
      },
    },
  });

  if (!task) {
    throw new BadRequestError("Task not found.");
  }

  if (task.userId === senderId) {
    throw new BadRequestError("You cannot remind yourself.");
  }

  if (task.user?.fcmToken) {
    await sendPushNotification(
      task.user.fcmToken,
      "⏰ You got a reminder!",
      message
    );
  }

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

  const reminder = await prisma.reminderNote.create({
    data: {
      taskId,
      senderId,
      message,
    },
  });

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true, photo: true },
  });

  if (!sender) {
    throw new BadRequestError("Sender not found.");
  }

  // ✅ Send notification to task owner
  await prisma.notification.create({
    data: {
      userId: task.userId,
      senderId,
      type: "reminder",
      message: `${sender?.name ?? "Someone"} reminded you about your task.`,
      metadata: {
        taskId,
        senderId,
        taskText: task.text,
        senderName: sender.name,
        senderPhoto: sender.photo,
      },
    },
  });

  return reminder;
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
