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
      type: "task-helper",
      message: `invited you to help with`,
      metadata: {
        taskId,
        taskText,
      },
    })),
  });
}
