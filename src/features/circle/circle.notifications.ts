import { prisma } from "../../db/client";
import { sendPushNotification } from "../../utils/sendPushNotification";
import { NotificationType } from "../../types/notificationTypes";

// Spec §9: at most 6 circle notifications per recipient per circle per day.
// Completions and circle-complete bypass the cap (always delivered).
export const CIRCLE_NOTIFICATIONS_DAILY_CAP = 6;

export function startOfToday() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

type SendCircleNotificationsInput = {
  circleId: string;
  recipientIds: string[];
  type: NotificationType;
  message: string;
  senderId?: string;
  // Omit for quiet, in-app-only notifications (e.g. dissolve).
  push?: { title: string; body: string };
  bypassCap?: boolean;
  metadata?: Record<string, unknown>;
  // FCM data overrides — e.g. invites deep-link to the join screen
  // (/c/<token>) instead of the circle detail.
  pushData?: Record<string, string>;
};

export async function sendCircleNotifications({
  circleId,
  recipientIds,
  type,
  message,
  senderId,
  push,
  bypassCap = false,
  metadata,
  pushData,
}: SendCircleNotificationsInput) {
  const recipients = [...new Set(recipientIds)];
  if (recipients.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: recipients } },
    select: { id: true, fcmToken: true },
  });

  for (const user of users) {
    if (!bypassCap) {
      const sentToday = await prisma.notification.count({
        where: {
          userId: user.id,
          type: { startsWith: "circle-" },
          createdAt: { gte: startOfToday() },
          metadata: { path: ["circleId"], equals: circleId },
        },
      });

      if (sentToday >= CIRCLE_NOTIFICATIONS_DAILY_CAP) continue;
    }

    await prisma.notification.create({
      data: {
        userId: user.id,
        senderId: senderId ?? null,
        type,
        taskType: "motivation",
        message,
        metadata: { circleId, ...metadata },
      },
    });

    if (push && user.fcmToken) {
      try {
        await sendPushNotification(user.fcmToken, push.title, push.body, {
          notificationType: type,
          circleId,
          deeplinkPath: `/circles/${circleId}`,
          screen: "CircleDetail",
          ...pushData,
        });
      } catch (error) {
        console.error("[CIRCLE_NOTIFICATION_PUSH_ERROR]", error);
      }
    }
  }
}
