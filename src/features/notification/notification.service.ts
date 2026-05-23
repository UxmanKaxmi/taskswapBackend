import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { prisma } from "../../db/client";
import { sendPushNotification } from "../../utils/sendPushNotification";
import { schedulePush } from "../../utils/scheduleReminderPush";
import { Prisma } from "@prisma/client";
import { USER_ORIGIN } from "../seededUser/seededUser.service";


const MOTIVATION_PUSH_MILESTONES = [10, 100, 500, 1000];

async function getNotifiableUserIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { in: uniqueIds },
      origin: USER_ORIGIN.REAL,
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

async function canReceiveNotifications(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { origin: true },
  });

  return user?.origin === USER_ORIGIN.REAL;
}

// 📨 Get notifications for the logged-in user
export async function getUserNotifications(userId: string) {
  return prisma.notification.findMany({
    where: {
      userId,
      NOT: { type: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT },
    },
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
  const recipientIds = await getNotifiableUserIds(helperIds);

  if (!recipientIds.length) return;

  const task = await prisma.task.findUnique({
  where: { id: taskId },
  select: { type: true },
});
if (!task) {
  console.warn("⚠️ Task not found for notification", { taskId });
  return;
}
  await prisma.notification.createMany({
    data: recipientIds.map((helperId) => ({
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
  const recipientIds = await getNotifiableUserIds(helperIds);

  if (!recipientIds.length) return;

  const task = await prisma.task.findUnique({
  where: { id: taskId },
  select: { type: true },
});

if (!task) {
  console.warn("⚠️ Task not found for notification", { taskId });
  return;
}
  await prisma.notification.createMany({
    data: recipientIds.map((helperId) => ({
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

export async function createTaskCompletedNotifications({
  recipientIds,
  senderId,
  taskId,
  taskText,
  taskType,
  senderName,
}: {
  recipientIds: string[];
  senderId: string;
  taskId: string;
  taskText: string;
  taskType: string;
  senderName: string;
}) {
  const uniqueRecipientIds = await getNotifiableUserIds(
    [...new Set(recipientIds)].filter((recipientId) => recipientId !== senderId)
  );

  if (!uniqueRecipientIds.length) return;

  await prisma.notification.createMany({
    data: uniqueRecipientIds.map((recipientId) => ({
      userId: recipientId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_COMPLETED,
      taskType,
      message: `completed “${taskText}”.`,
      metadata: {
        taskId,
        taskText,
      },
    })),
  });

  const recipients = await prisma.user.findMany({
    where: {
      id: { in: uniqueRecipientIds },
      fcmToken: { not: null },
      origin: USER_ORIGIN.REAL,
    },
    select: {
      id: true,
      fcmToken: true,
    },
  });

  await Promise.all(
    recipients.map((recipient) =>
      recipient.fcmToken
        ? schedulePush(0, recipient.fcmToken, "✅ Task completed", `${senderName} completed "${taskText}"`, {
            notificationType: NOTIFICATION_TYPES.TASK_COMPLETED,
            taskId,
            taskType,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
          })
        : undefined
    )
  );
}

export async function createTaskProgressUpdateNotifications({
  recipientIds,
  senderId,
  taskId,
  progressUpdateId,
  taskText,
  progressText,
  taskType,
  senderName,
}: {
  recipientIds: string[];
  senderId: string;
  taskId: string;
  progressUpdateId: string;
  taskText: string;
  progressText: string;
  taskType: string;
  senderName: string;
}) {
  const uniqueRecipientIds = await getNotifiableUserIds([...new Set(recipientIds)].filter(
    (recipientId) => recipientId !== senderId
  ));

  if (!uniqueRecipientIds.length) return;

  await prisma.notification.createMany({
    data: uniqueRecipientIds.map((recipientId) => ({
      userId: recipientId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
      taskType,
      message: `${senderName} shared a progress update on your task.`,
      metadata: {
        taskId,
        taskText,
        progressText,
        progressUpdateId,
      },
    })),
  });

  const recipients = await prisma.user.findMany({
    where: {
      id: { in: uniqueRecipientIds },
      fcmToken: { not: null },
      origin: USER_ORIGIN.REAL,
    },
    select: {
      id: true,
      fcmToken: true,
    },
  });

  const pushBody = `${senderName} shared a progress update on "${taskText}"`;

  await Promise.all(
    recipients.map((recipient) =>
      recipient.fcmToken
        ? schedulePush(0, recipient.fcmToken, "📈 Progress update", pushBody, {
            notificationType: NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
            taskId,
            taskType,
            progressUpdateId,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
          })
        : undefined
    )
  );
}

export async function sendTestDecisionDoneNotification(userId: string) {
  if (!(await canReceiveNotifications(userId))) {
    throw new Error("User not found");
  }

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
  if (!(await canReceiveNotifications(task.userId))) return;

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
  const recipientIds = await getNotifiableUserIds(mentionedIds);

  if (!recipientIds.length) return;

  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { type: true },
  });

  if (!task) return;

  await tx.notification.createMany({
    data: recipientIds.map((userId) => ({
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
  if (!(await canReceiveNotifications(taskOwnerId))) return;

  const [task, taskOwner, pushedByUser] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: { type: true, text: true },
    }),
    prisma.user.findUnique({
      where: { id: taskOwnerId },
      select: { fcmToken: true, origin: true },
    }),
    prisma.user.findUnique({
      where: { id: pushedByUserId },
      select: { name: true, origin: true },
    }),
  ]);

  if (!task) return;
  if (task.type !== "motivation") return;

  const notification = await prisma.notification.create({
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

  if (taskOwner?.fcmToken && taskOwner.origin === USER_ORIGIN.REAL) {
    const senderName =
      pushedByUser?.origin === USER_ORIGIN.SEEDED
        ? "Someone"
        : pushedByUser?.name?.trim() || "Someone";
    await sendPushNotification(
      taskOwner.fcmToken,
      `${senderName} pushed your motivation.`,
      task.text,
      {
        notificationType: NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
        taskId,
        taskType: task.type,
        notificationId: notification.id,
        screen: "TaskDetail",
        deeplinkPath: `/tasks/${taskId}`,
      }
    );
  }

  return notification;
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
  if (!(await canReceiveNotifications(taskOwnerId))) return;

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
    select: { fcmToken: true, origin: true },
  });

  if (user?.fcmToken && user.origin === USER_ORIGIN.REAL) {
    await sendPushNotification(
      user.fcmToken,
      "🔥 Motivation milestone!",
      `Your motivation just reached ${pushCount} pushes`,
      {
        notificationType: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE,
        taskId,
        taskType: task.type,
        pushCount,
        screen: "TaskDetail",
        deeplinkPath: `/tasks/${taskId}`,
      }
    );
  }

  // 🧠 Save internal marker so we don’t resend
  await prisma.notification.create({
    data: {
      userId: taskOwnerId,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
      taskType: task.type,
      message: "milestone push sent",
      read: true, // internal marker; never show as unread
      metadata: {
        taskId,
        pushCount,
      },
    },
  });
}
