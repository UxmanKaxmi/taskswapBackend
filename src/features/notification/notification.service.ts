import { sendPushNotification } from "../../utils/sendPushNotification";
import { prisma } from "../../db/client";

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

export async function markNotificationAsRead(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

export async function sendTestNotification(
  userId: string,
  title: string,
  body: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true }, // ✅ Will work only if schema has this field
  });
  console.log("🎯 Token:", user?.fcmToken);
  if (!user?.fcmToken) {
    throw new Error("User or FCM token not found");
  }

  await sendPushNotification(user.fcmToken, title, body);
}
