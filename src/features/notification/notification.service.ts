import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { prisma } from "../../db/client";
import { sendPushNotification } from "../../utils/sendPushNotification";
import { schedulePush } from "../../utils/scheduleReminderPush";
import {
  DEFAULT_TEST_NOTIFICATION_TEXT,
  getCommentMentionNotificationMessage,
  getDecisionDoneNotificationMessage,
  getMotivationMilestoneNotificationText,
  getMotivationPushNotificationMessage,
  getProgressUpdateNotificationText,
  getPushedTaskMilestoneNotificationMessage,
  getPushedTaskMilestoneNotificationText,
  getTaskAdviceNotificationMessage,
  getTaskHelperNotificationMessage,
  getTaskProgressUpdateNotificationMessage,
  getNotificationMarkerMessage,
} from "../../utils/notificationTextCatalog";
import { Prisma, PrismaClient } from "@prisma/client";
import { USER_ORIGIN } from "../seededUser/seededUser.service";


const MOTIVATION_PUSH_MILESTONES = [5, 10, 20, 50, 100];

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
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

// ✅ Mark multiple notifications as read (batch)
export async function markNotificationsAsRead(
  notificationIds: string[],
  userId: string
) {
  return prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId,
    },
    data: { read: true },
  });
}

// 🔔 Send a test push notification to a user
export async function sendTestNotification(
  userId: string,
  title: string = DEFAULT_TEST_NOTIFICATION_TEXT.title,
  body: string = DEFAULT_TEST_NOTIFICATION_TEXT.body,
  data?: Record<string, string>
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  console.log("🎯 Token:", user?.fcmToken);

  if (!user?.fcmToken) {
    throw new Error("User or FCM token not found");
  }

  await sendPushNotification(user.fcmToken, title, body, data);
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
      message: getTaskHelperNotificationMessage(),
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
      message: getDecisionDoneNotificationMessage(taskText),
      metadata: {
        taskId,
        taskText,
      },
    })),
  });
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
  const uniqueRecipientIds = [...new Set(recipientIds)].filter(
    (recipientId) => recipientId !== senderId
  );

  if (!uniqueRecipientIds.length) return;

  await prisma.notification.createMany({
    data: uniqueRecipientIds.map((recipientId) => ({
      userId: recipientId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
      taskType,
      message: getTaskProgressUpdateNotificationMessage(senderName),
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
    },
    select: {
      id: true,
      fcmToken: true,
    },
  });

  const { title, body } = getProgressUpdateNotificationText(taskText, senderName);

  await Promise.all(
    recipients.map((recipient) =>
      recipient.fcmToken
        ? schedulePush(0, recipient.fcmToken, title, body, {
            notificationType: NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
            taskId,
            taskType,
            progressUpdateId,
            deeplinkPath: `/tasks/${taskId}`,
            screen: "TaskDetail",
          })
        : undefined
    )
  );
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
      message: getDecisionDoneNotificationMessage("Test Decision"),
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

  if (!task) return null;
  if (task.type !== "advice") return null;
  if (task.userId === senderId) return null;

  await tx.notification.create({
    data: {
      userId: task.userId,
      senderId,
      type: NOTIFICATION_TYPES.TASK_ADVICE,
      taskType: task.type,
      message: getTaskAdviceNotificationMessage(),
      metadata: {
        taskId,
        taskText: task.text,
        adviceText: commentText,
      },
    },
  });

  // Returned so the caller can send the FCM push after the transaction commits.
  return { ownerId: task.userId, taskText: task.text };
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
      message: getCommentMentionNotificationMessage(),
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
      message: getMotivationPushNotificationMessage(),
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
  triggeredByUserId,
}: {
  taskId: string;
  taskOwnerId: string;
  pushCount: number;
  triggeredByUserId?: string;
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
    const { title, body } = getMotivationMilestoneNotificationText(pushCount);

    await sendPushNotification(user.fcmToken, title, body, {
      notificationType: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE,
      taskId,
      taskType: task.type,
      pushCount: String(pushCount),
      deeplinkPath: `/tasks/${taskId}`,
      screen: "TaskDetail",
    });
  }

  // 📣 Tell earlier pushers their push is paying off. The pusher who just
  // triggered the milestone is excluded — they saw the count when they tapped.
  await notifyPushersOfMilestone({
    taskId,
    taskOwnerId,
    taskType: task.type,
    taskText: task.text,
    pushCount,
    triggeredByUserId,
  });

  // 🧠 Save internal marker so we don’t resend
  await prisma.notification.create({
    data: {
      userId: taskOwnerId,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
      taskType: task.type,
      message: getNotificationMarkerMessage(),
      read: true, // internal marker; never show as unread
      metadata: {
        taskId,
        pushCount,
      },
    },
  });
}

async function notifyPushersOfMilestone({
  taskId,
  taskOwnerId,
  taskType,
  taskText,
  pushCount,
  triggeredByUserId,
}: {
  taskId: string;
  taskOwnerId: string;
  taskType: string;
  taskText: string;
  pushCount: number;
  triggeredByUserId?: string;
}) {
  const excludedIds = [taskOwnerId];
  if (triggeredByUserId) excludedIds.push(triggeredByUserId);

  const supporters = await prisma.user.findMany({
    where: {
      origin: USER_ORIGIN.REAL,
      id: { notIn: excludedIds },
      Push: { some: { taskId } },
    },
    select: { id: true, fcmToken: true },
  });

  if (!supporters.length) return;

  await prisma.notification.createMany({
    data: supporters.map((supporter) => ({
      userId: supporter.id,
      senderId: null,
      type: NOTIFICATION_TYPES.TASK_PUSHED_TASK_MILESTONE,
      taskType,
      message: getPushedTaskMilestoneNotificationMessage(pushCount, taskText),
      metadata: {
        taskId,
        taskText,
        pushCount,
      },
    })),
  });

  const { title, body } = getPushedTaskMilestoneNotificationText(pushCount);

  await Promise.all(
    supporters.map((supporter) =>
      supporter.fcmToken
        ? sendPushNotification(supporter.fcmToken, title, body, {
            notificationType: NOTIFICATION_TYPES.TASK_PUSHED_TASK_MILESTONE,
            taskId,
            taskType,
            pushCount: String(pushCount),
            deeplinkPath: `/tasks/${taskId}`,
            screen: "TaskDetail",
          })
        : undefined
    )
  );
}
