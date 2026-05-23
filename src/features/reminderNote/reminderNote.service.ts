import { sendPushNotification } from "../../utils/sendPushNotification";
import { prisma } from "../../db/client";
import { BadRequestError } from "../../errors";
import { ReminderNoteDTO, SendReminderNoteInput } from "./reminderNote.types";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { USER_ORIGIN } from "../seededUser/seededUser.service";

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
      type: true,
      user: { select: { fcmToken: true, origin: true } },
    },
  });

  if (!task) throw new BadRequestError("Task not found.");
  if (task.userId === senderId)
    throw new BadRequestError("You cannot remind yourself.");

  // Notify task owner via push
  if (task.user?.fcmToken && task.user.origin === USER_ORIGIN.REAL) {
    await sendPushNotification(
      task.user.fcmToken,
      "⏰ You got a reminder!",
      message,
      {
        notificationType: NOTIFICATION_TYPES.REMINDER,
        taskId,
        taskType: task.type,
        screen: "TaskDetail",
        deeplinkPath: `/tasks/${taskId}`,
      }
    );
  }

  // Prevent duplicate reminders from same user
  const existing = await prisma.reminderNote.findFirst({
    where: { taskId, senderId },
  });

  if (existing) {
    throw new BadRequestError("You already sent a reminder for this task.");
  }

  const reminder = await prisma.reminderNote.create({
    data: { taskId, senderId, message },
  });

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true, photo: true },
  });

  if (task.user.origin === USER_ORIGIN.REAL) {
    // Create notification entry
    await prisma.notification.create({
      data: {
        userId: task.userId,
        senderId,
        type: NOTIFICATION_TYPES.REMINDER,
        taskType: task.type,
        message: `${sender?.name ?? "Someone"} reminded you about your task.`,
        metadata: {
          taskId,
          senderId,
          taskText: task.text,
          senderName: sender?.name,
          senderPhoto: sender?.photo,
        },
      },
    });
  }

  return reminder;
}

export async function getRemindersByTask(
  taskId: string,
  userId: string | null
): Promise<ReminderNoteDTO[]> {
  const notes = await prisma.reminderNote.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { name: true, photo: true } },
    },
  });

  return notes.map((note) => {
    const isSenderCurrentUser = !!userId && note.senderId === userId;

    return {
      id: note.id,
      taskId: note.taskId,
      senderId: note.senderId,
      message: note.message,
      createdAt: note.createdAt.toISOString(),
      senderName: note.sender?.name ?? "Unknown",
      isSenderCurrentUser,
      senderPhoto: note.sender?.photo ?? null,
    };
  });
}
