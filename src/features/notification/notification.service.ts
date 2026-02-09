import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { prisma } from "../../db/client";
import { sendPushNotification } from "../../utils/sendPushNotification";
import { Prisma, PrismaClient } from "@prisma/client";


const MOTIVATION_PUSH_MILESTONES = [10, 100, 500, 1000];

// 📨 Get notifications for the logged-in user
export async function getUserNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      type: true,
      taskType: true, // 👈 ADD THIS
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

  const task = await prisma.task.findUnique({
  where: { id: taskId },
  select: { type: true },
});
if (!task) {
  console.warn("⚠️ Task not found for notification", { taskId });
  return;
}
  await prisma.notification.createMany({
    data: helperIds.map((helperId) => ({
      userId: helperId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_HELPER,
      taskType: task.type, 
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

  const task = await prisma.task.findUnique({
  where: { id: taskId },
  select: { type: true },
});

if (!task) {
  console.warn("⚠️ Task not found for notification", { taskId });
  return;
}
  await prisma.notification.createMany({
    data: helperIds.map((helperId) => ({
      userId: helperId,
      senderId,
      type: NOTIFICATION_TYPES.DECISION_DONE,
      taskType: task.type, // 👈 important
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


// 💡 Advice notification
export async function createTaskAdviceNotification(
  tx: Prisma.TransactionClient,
  {
    taskId,
    senderId,
    commentText,
  }: {
    taskId: string;
    senderId: string;
    commentText: string;
  }
) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      userId: true,
      type: true,
      text: true,
    },
  });

  if (!task) return;
  if (task.type !== "advice") return;
  if (task.userId === senderId) return;

  await tx.notification.create({
    data: {
      userId: task.userId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_ADVICE,
      taskType: task.type,
      message: "gave advice on your task",
      metadata: {
        taskId,
        taskText: task.text,
        adviceText: commentText,
      },
    },
  });
}


// 💬 Mention notifications
export async function createCommentMentionNotifications(
  tx: Prisma.TransactionClient,
  {
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
  }
) {
  if (!mentionedIds.length) return;

  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { type: true },
  });

  if (!task) return;

  await tx.notification.createMany({
    data: mentionedIds.map((userId) => ({
      userId,
      senderId,
      type: NOTIFICATION_TYPES.COMMENT,
      taskType: task.type,
      message: "mentioned you in a comment",
      metadata: {
        taskId,
        commentId,
        commentText,
      },
    })),
  });
}



export async function createMotivationPushNotification({
  taskId,
  taskOwnerId,
  pushedByUserId,
}: {
  taskId: string;
  taskOwnerId: string;
  pushedByUserId: string;
}) {
  if (taskOwnerId === pushedByUserId) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { type: true, text: true },
  });

  if (!task) return;

  return prisma.notification.create({
    data: {
      userId: taskOwnerId,
      senderId: pushedByUserId,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
      taskType: task.type,
      message: "pushed your motivation 💪",
      metadata: {
        taskId,
        taskText: task.text,
      },
    },
  });
}


export async function createMotivationMilestoneNotification({
  taskId,
  taskOwnerId,
  pushCount,
}: {
  taskId: string;
  taskOwnerId: string;
  pushCount: number;
}) {
  if (!MOTIVATION_PUSH_MILESTONES.includes(pushCount)) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { type: true, text: true },
  });

  if (!task) return;

  // 🔒 Check if this milestone was already sent
  const alreadySent = await prisma.notification.findFirst({
    where: {
      userId: taskOwnerId,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
      AND: [
        {
          metadata: {
            path: ["taskId"],
            equals: taskId,
          },
        },
        {
          metadata: {
            path: ["pushCount"],
            equals: pushCount,
          },
        },
      ],
    },
  });

  if (alreadySent) return;

  // 📱 Send FCM push
  const user = await prisma.user.findUnique({
    where: { id: taskOwnerId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    await sendPushNotification(
      user.fcmToken,
      "🔥 Motivation milestone!",
      `Your motivation just reached ${pushCount} pushes`
    );
  }

  // 🧠 Save internal marker so we don’t resend
  await prisma.notification.create({
    data: {
      userId: taskOwnerId,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
      taskType: task.type,
      message: "milestone push sent",
      metadata: {
        taskId,
        pushCount,
      },
    },
  });
}