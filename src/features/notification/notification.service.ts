import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { prisma } from "../../db/client";
import { sendPushNotification } from "../../utils/sendPushNotification";

// 📨 Get notifications for the logged-in user
export async function getUserNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      type: true,
      message: true,
      metadata: true,
      read: true,
      createdAt: true,
      sender: {
        select: {
          id: true,
          name: true,
          photo: true,
        },
      },
    },
  });
}

// ✅ Mark a single notification as read
export async function markNotificationAsRead(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

// ✅ Mark multiple notifications as read (batch)
export async function markNotificationsAsRead(notificationIds: string[]) {
  return prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
    },
    data: { read: true },
  });
}

// 🔔 Send a test push notification to a user
export async function sendTestNotification(
  userId: string,
  title: string = "Test Notification",
  body: string = "🚀 This is a test."
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  console.log("🎯 Token:", user?.fcmToken);

  if (!user?.fcmToken) {
    throw new Error("User or FCM token not found");
  }

  await sendPushNotification(user.fcmToken, title, body);
}

// 👥 Notify helpers when invited to a task
export async function createTaskHelperNotifications({
  helperIds,
  senderId,
  taskId,
  taskText,
}: {
  helperIds: string[];
  senderId: string;
  taskId: string;
  taskText: string;
}) {
  if (!helperIds.length) return;

  await prisma.notification.createMany({
    data: helperIds.map((helperId) => ({
      userId: helperId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_HELPER,
      message: `invited you to help with`,
      metadata: {
        taskId,
        taskText,
      },
    })),
  });
}

export async function createDecisionTaskDoneNotifications({
  helperIds,
  senderId,
  taskId,
  taskText,
}: {
  helperIds: string[];
  senderId: string;
  taskId: string;
  taskText: string;
}) {
  if (!helperIds.length) return;

  await prisma.notification.createMany({
    data: helperIds.map((helperId) => ({
      userId: helperId,
      senderId,
      type: NOTIFICATION_TYPES.DECISION_DONE,
      message: `marked the decision “${taskText}” as done.`,
      metadata: {
        taskId,
        taskText,
      },
    })),
  });
}

export async function sendTestDecisionDoneNotification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      photo: true,
    },
  });

  if (!user) throw new Error("User not found");

  await prisma.notification.create({
    data: {
      userId,
      senderId: userId,
      type: NOTIFICATION_TYPES.DECISION_DONE,
      message: `marked the decision “Test Decision” as done.`,
      metadata: {
        taskId: "demo-task-id",
        taskText: "Test Decision",
        senderName: user.name,
        senderPhoto: user.photo,
      },
    },
  });

  console.log("✅ Test decisionDone notification sent to:", userId);
}

export async function createCommentMentionNotifications({
  mentionedIds,
  senderId,
  taskId,
  commentId,
  commentText,
}: {
  mentionedIds: string[];
  senderId: string;
  taskId: string;
  commentId: string;
  commentText: string;
}) {
  if (!mentionedIds.length) return;

  await prisma.notification.createMany({
    data: mentionedIds.map((userId) => ({
      userId,
      senderId,
      type: "comment", // camelCase type
      message: "mentioned you in a comment",
      metadata: {
        taskId,
        commentId,
        commentText,
      },
    })),
  });
}
