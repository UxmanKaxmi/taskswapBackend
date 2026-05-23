"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNotifications = getUserNotifications;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markNotificationsAsRead = markNotificationsAsRead;
exports.createTaskHelperNotifications = createTaskHelperNotifications;
exports.createDecisionTaskDoneNotifications = createDecisionTaskDoneNotifications;
exports.createTaskCompletedNotifications = createTaskCompletedNotifications;
exports.createTaskProgressUpdateNotifications = createTaskProgressUpdateNotifications;
exports.sendTestDecisionDoneNotification = sendTestDecisionDoneNotification;
exports.createTaskAdviceNotification = createTaskAdviceNotification;
exports.createCommentMentionNotifications = createCommentMentionNotifications;
exports.createMotivationPushNotification = createMotivationPushNotification;
exports.createMotivationMilestoneNotification = createMotivationMilestoneNotification;
const notificationTypes_1 = require("../../types/notificationTypes");
const client_1 = require("../../db/client");
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const seededUser_service_1 = require("../seededUser/seededUser.service");
const MOTIVATION_PUSH_MILESTONES = [10, 100, 500, 1000];
async function getNotifiableUserIds(userIds) {
    const uniqueIds = [...new Set(userIds)];
    if (!uniqueIds.length)
        return [];
    const users = await client_1.prisma.user.findMany({
        where: {
            id: { in: uniqueIds },
            origin: seededUser_service_1.USER_ORIGIN.REAL,
        },
        select: { id: true },
    });
    return users.map((user) => user.id);
}
async function canReceiveNotifications(userId) {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { origin: true },
    });
    return user?.origin === seededUser_service_1.USER_ORIGIN.REAL;
}
// 📨 Get notifications for the logged-in user
async function getUserNotifications(userId) {
    return client_1.prisma.notification.findMany({
        where: {
            userId,
            NOT: { type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT },
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
async function markNotificationAsRead(notificationId) {
    return client_1.prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
    });
}
// ✅ Mark multiple notifications as read (batch)
async function markNotificationsAsRead(notificationIds) {
    return client_1.prisma.notification.updateMany({
        where: {
            id: { in: notificationIds },
        },
        data: { read: true },
    });
}
// 👥 Notify helpers when invited to a task
async function createTaskHelperNotifications({ helperIds, senderId, taskId, taskText, }) {
    if (!helperIds.length)
        return;
    const recipientIds = await getNotifiableUserIds(helperIds);
    if (!recipientIds.length)
        return;
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { type: true },
    });
    if (!task) {
        console.warn("⚠️ Task not found for notification", { taskId });
        return;
    }
    await client_1.prisma.notification.createMany({
        data: recipientIds.map((helperId) => ({
            userId: helperId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_HELPER,
            taskType: task.type,
            message: `invited you to help with`,
            metadata: {
                taskId,
                taskText,
            },
        })),
    });
}
async function createDecisionTaskDoneNotifications({ helperIds, senderId, taskId, taskText, }) {
    if (!helperIds.length)
        return;
    const recipientIds = await getNotifiableUserIds(helperIds);
    if (!recipientIds.length)
        return;
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { type: true },
    });
    if (!task) {
        console.warn("⚠️ Task not found for notification", { taskId });
        return;
    }
    await client_1.prisma.notification.createMany({
        data: recipientIds.map((helperId) => ({
            userId: helperId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.DECISION_DONE,
            taskType: task.type, // 👈 important
            message: `marked the decision “${taskText}” as done.`,
            metadata: {
                taskId,
                taskText,
            },
        })),
    });
}
async function createTaskCompletedNotifications({ recipientIds, senderId, taskId, taskText, taskType, senderName, }) {
    const uniqueRecipientIds = await getNotifiableUserIds([...new Set(recipientIds)].filter((recipientId) => recipientId !== senderId));
    if (!uniqueRecipientIds.length)
        return;
    await client_1.prisma.notification.createMany({
        data: uniqueRecipientIds.map((recipientId) => ({
            userId: recipientId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_COMPLETED,
            taskType,
            message: `completed “${taskText}”.`,
            metadata: {
                taskId,
                taskText,
            },
        })),
    });
    const recipients = await client_1.prisma.user.findMany({
        where: {
            id: { in: uniqueRecipientIds },
            fcmToken: { not: null },
            origin: seededUser_service_1.USER_ORIGIN.REAL,
        },
        select: {
            id: true,
            fcmToken: true,
        },
    });
    await Promise.all(recipients.map((recipient) => recipient.fcmToken
        ? (0, scheduleReminderPush_1.schedulePush)(0, recipient.fcmToken, "✅ Task completed", `${senderName} completed "${taskText}"`, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_COMPLETED,
            taskId,
            taskType,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
        })
        : undefined));
}
async function createTaskProgressUpdateNotifications({ recipientIds, senderId, taskId, progressUpdateId, taskText, progressText, taskType, senderName, }) {
    const uniqueRecipientIds = await getNotifiableUserIds([...new Set(recipientIds)].filter((recipientId) => recipientId !== senderId));
    if (!uniqueRecipientIds.length)
        return;
    await client_1.prisma.notification.createMany({
        data: uniqueRecipientIds.map((recipientId) => ({
            userId: recipientId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
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
    const recipients = await client_1.prisma.user.findMany({
        where: {
            id: { in: uniqueRecipientIds },
            fcmToken: { not: null },
            origin: seededUser_service_1.USER_ORIGIN.REAL,
        },
        select: {
            id: true,
            fcmToken: true,
        },
    });
    const pushBody = `${senderName} shared a progress update on "${taskText}"`;
    await Promise.all(recipients.map((recipient) => recipient.fcmToken
        ? (0, scheduleReminderPush_1.schedulePush)(0, recipient.fcmToken, "📈 Progress update", pushBody, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
            taskId,
            taskType,
            progressUpdateId,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
        })
        : undefined));
}
async function sendTestDecisionDoneNotification(userId) {
    if (!(await canReceiveNotifications(userId))) {
        throw new Error("User not found");
    }
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            photo: true,
        },
    });
    if (!user)
        throw new Error("User not found");
    await client_1.prisma.notification.create({
        data: {
            userId,
            senderId: userId,
            type: notificationTypes_1.NOTIFICATION_TYPES.DECISION_DONE,
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
async function createTaskAdviceNotification(tx, { taskId, senderId, commentText, }) {
    const task = await tx.task.findUnique({
        where: { id: taskId },
        select: {
            userId: true,
            type: true,
            text: true,
        },
    });
    if (!task)
        return;
    if (task.type !== "advice")
        return;
    if (task.userId === senderId)
        return;
    if (!(await canReceiveNotifications(task.userId)))
        return;
    await tx.notification.create({
        data: {
            userId: task.userId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_ADVICE,
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
async function createCommentMentionNotifications(tx, { mentionedIds, senderId, taskId, commentId, commentText, }) {
    if (!mentionedIds.length)
        return;
    const recipientIds = await getNotifiableUserIds(mentionedIds);
    if (!recipientIds.length)
        return;
    const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { type: true },
    });
    if (!task)
        return;
    await tx.notification.createMany({
        data: recipientIds.map((userId) => ({
            userId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.COMMENT,
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
async function createMotivationPushNotification({ taskId, taskOwnerId, pushedByUserId, }) {
    if (taskOwnerId === pushedByUserId)
        return;
    if (!(await canReceiveNotifications(taskOwnerId)))
        return;
    const [task, taskOwner, pushedByUser] = await Promise.all([
        client_1.prisma.task.findUnique({
            where: { id: taskId },
            select: { type: true, text: true },
        }),
        client_1.prisma.user.findUnique({
            where: { id: taskOwnerId },
            select: { fcmToken: true, origin: true },
        }),
        client_1.prisma.user.findUnique({
            where: { id: pushedByUserId },
            select: { name: true, origin: true },
        }),
    ]);
    if (!task)
        return;
    if (task.type !== "motivation")
        return;
    const notification = await client_1.prisma.notification.create({
        data: {
            userId: taskOwnerId,
            senderId: pushedByUserId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
            taskType: task.type,
            message: "pushed your motivation 💪",
            metadata: {
                taskId,
                taskText: task.text,
            },
        },
    });
    if (taskOwner?.fcmToken && taskOwner.origin === seededUser_service_1.USER_ORIGIN.REAL) {
        const senderName = pushedByUser?.origin === seededUser_service_1.USER_ORIGIN.SEEDED
            ? "Someone"
            : pushedByUser?.name?.trim() || "Someone";
        await (0, sendPushNotification_1.sendPushNotification)(taskOwner.fcmToken, `${senderName} pushed your motivation.`, task.text, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
            taskId,
            taskType: task.type,
            notificationId: notification.id,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
        });
    }
    return notification;
}
async function createMotivationMilestoneNotification({ taskId, taskOwnerId, pushCount, }) {
    if (!MOTIVATION_PUSH_MILESTONES.includes(pushCount))
        return;
    if (!(await canReceiveNotifications(taskOwnerId)))
        return;
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { type: true, text: true },
    });
    if (!task)
        return;
    // 🔒 Check if this milestone was already sent
    const alreadySent = await client_1.prisma.notification.findFirst({
        where: {
            userId: taskOwnerId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
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
    if (alreadySent)
        return;
    // 📱 Send FCM push
    const user = await client_1.prisma.user.findUnique({
        where: { id: taskOwnerId },
        select: { fcmToken: true, origin: true },
    });
    if (user?.fcmToken && user.origin === seededUser_service_1.USER_ORIGIN.REAL) {
        await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, "🔥 Motivation milestone!", `Your motivation just reached ${pushCount} pushes`, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE,
            taskId,
            taskType: task.type,
            pushCount,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
        });
    }
    // 🧠 Save internal marker so we don’t resend
    await client_1.prisma.notification.create({
        data: {
            userId: taskOwnerId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
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
