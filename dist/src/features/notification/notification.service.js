"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNotifications = getUserNotifications;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markNotificationsAsRead = markNotificationsAsRead;
exports.sendTestNotification = sendTestNotification;
exports.createTaskHelperNotifications = createTaskHelperNotifications;
exports.createDecisionTaskDoneNotifications = createDecisionTaskDoneNotifications;
exports.createTaskProgressUpdateNotifications = createTaskProgressUpdateNotifications;
exports.sendTestDecisionDoneNotification = sendTestDecisionDoneNotification;
exports.createTaskAdviceNotification = createTaskAdviceNotification;
exports.createCommentMentionNotifications = createCommentMentionNotifications;
exports.createMotivationPushNotification = createMotivationPushNotification;
exports.sendSilentNotificationToUser = sendSilentNotificationToUser;
exports.sendMotivationPushSilentNotification = sendMotivationPushSilentNotification;
exports.createMotivationMilestoneNotification = createMotivationMilestoneNotification;
const notificationTypes_1 = require("../../types/notificationTypes");
const client_1 = require("../../db/client");
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
const seededUser_service_1 = require("../seededUser/seededUser.service");
const MOTIVATION_PUSH_MILESTONES = [5, 10, 20, 50, 100];
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
async function markNotificationAsRead(notificationId, userId) {
    return client_1.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { read: true },
    });
}
// ✅ Mark multiple notifications as read (batch)
async function markNotificationsAsRead(notificationIds, userId) {
    return client_1.prisma.notification.updateMany({
        where: {
            id: { in: notificationIds },
            userId,
        },
        data: { read: true },
    });
}
// 🔔 Send a test push notification to a user
async function sendTestNotification(userId, title = notificationTextCatalog_1.DEFAULT_TEST_NOTIFICATION_TEXT.title, body = notificationTextCatalog_1.DEFAULT_TEST_NOTIFICATION_TEXT.body, data) {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
    });
    console.log("🎯 Token:", user?.fcmToken);
    if (!user?.fcmToken) {
        throw new Error("User or FCM token not found");
    }
    await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, title, body, data);
}
// 👥 Notify helpers when invited to a task
async function createTaskHelperNotifications({ helperIds, senderId, taskId, taskText, }) {
    if (!helperIds.length)
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
        data: helperIds.map((helperId) => ({
            userId: helperId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_HELPER,
            taskType: task.type,
            message: (0, notificationTextCatalog_1.getTaskHelperNotificationMessage)(),
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
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { type: true },
    });
    if (!task) {
        console.warn("⚠️ Task not found for notification", { taskId });
        return;
    }
    await client_1.prisma.notification.createMany({
        data: helperIds.map((helperId) => ({
            userId: helperId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.DECISION_DONE,
            taskType: task.type, // 👈 important
            message: (0, notificationTextCatalog_1.getDecisionDoneNotificationMessage)(taskText),
            metadata: {
                taskId,
                taskText,
            },
        })),
    });
}
async function createTaskProgressUpdateNotifications({ recipientIds, senderId, taskId, progressUpdateId, taskText, progressText, taskType, senderName, }) {
    const uniqueRecipientIds = [...new Set(recipientIds)].filter((recipientId) => recipientId !== senderId);
    if (!uniqueRecipientIds.length)
        return;
    await client_1.prisma.notification.createMany({
        data: uniqueRecipientIds.map((recipientId) => ({
            userId: recipientId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
            taskType,
            message: (0, notificationTextCatalog_1.getTaskProgressUpdateNotificationMessage)(senderName),
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
        },
        select: {
            id: true,
            fcmToken: true,
        },
    });
    const { title, body } = (0, notificationTextCatalog_1.getProgressUpdateNotificationText)(taskText, senderName);
    await Promise.all(recipients.map((recipient) => recipient.fcmToken
        ? (0, scheduleReminderPush_1.schedulePush)(0, recipient.fcmToken, title, body, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_PROGRESS_UPDATE,
            taskId,
            taskType,
            progressUpdateId,
            deeplinkPath: `/tasks/${taskId}`,
            screen: "TaskDetail",
        })
        : undefined));
}
async function sendTestDecisionDoneNotification(userId) {
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
            message: (0, notificationTextCatalog_1.getDecisionDoneNotificationMessage)("Test Decision"),
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
        return null;
    if (task.type !== "advice")
        return null;
    if (task.userId === senderId)
        return null;
    await tx.notification.create({
        data: {
            userId: task.userId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_ADVICE,
            taskType: task.type,
            message: (0, notificationTextCatalog_1.getTaskAdviceNotificationMessage)(),
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
async function createCommentMentionNotifications(tx, { mentionedIds, senderId, taskId, commentId, commentText, }) {
    if (!mentionedIds.length)
        return;
    const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { type: true },
    });
    if (!task)
        return;
    await tx.notification.createMany({
        data: mentionedIds.map((userId) => ({
            userId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.COMMENT,
            taskType: task.type,
            message: (0, notificationTextCatalog_1.getCommentMentionNotificationMessage)(),
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
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { type: true, text: true },
    });
    if (!task)
        return;
    return client_1.prisma.notification.create({
        data: {
            userId: taskOwnerId,
            senderId: pushedByUserId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
            taskType: task.type,
            message: (0, notificationTextCatalog_1.getMotivationPushNotificationMessage)(),
            metadata: {
                taskId,
                taskText: task.text,
            },
        },
    });
}
// Low-level "separate API" for silent (data-only) pushes: look up the user's
// device token and deliver a data payload with no visible banner. Returns
// false (never throws) when the user has no token, so callers in a request
// path can fire-and-forget without risking the response.
async function sendSilentNotificationToUser(userId, data) {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
    });
    if (!user?.fcmToken)
        return false;
    return (0, sendPushNotification_1.sendSilentPushNotification)(user.fcmToken, data);
}
// Live "X pushed you" pill: a silent push to the goal owner on every push.
// Unlike the milestone FCM, this fires on each push and carries the pusher's
// name so the client can render it without a follow-up fetch.
async function sendMotivationPushSilentNotification({ taskId, taskOwnerId, pushedByUserId, pushCount, }) {
    if (taskOwnerId === pushedByUserId)
        return false;
    const [task, pusher] = await Promise.all([
        client_1.prisma.task.findUnique({ where: { id: taskId }, select: { type: true } }),
        client_1.prisma.user.findUnique({ where: { id: pushedByUserId }, select: { name: true } }),
    ]);
    if (!task)
        return false;
    return sendSilentNotificationToUser(taskOwnerId, {
        notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
        taskId,
        taskType: task.type,
        pusherName: pusher?.name?.trim() || "Someone",
        pushCount: String(pushCount),
        deeplinkPath: `/tasks/${taskId}`,
        screen: "TaskDetail",
    });
}
async function createMotivationMilestoneNotification({ taskId, taskOwnerId, pushCount, triggeredByUserId, }) {
    if (!MOTIVATION_PUSH_MILESTONES.includes(pushCount))
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
        select: { fcmToken: true },
    });
    if (user?.fcmToken) {
        const { title, body } = (0, notificationTextCatalog_1.getMotivationMilestoneNotificationText)(pushCount);
        await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, title, body, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE,
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
    await client_1.prisma.notification.create({
        data: {
            userId: taskOwnerId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_MILESTONE_SENT,
            taskType: task.type,
            message: (0, notificationTextCatalog_1.getNotificationMarkerMessage)(),
            read: true, // internal marker; never show as unread
            metadata: {
                taskId,
                pushCount,
            },
        },
    });
}
async function notifyPushersOfMilestone({ taskId, taskOwnerId, taskType, taskText, pushCount, triggeredByUserId, }) {
    const excludedIds = [taskOwnerId];
    if (triggeredByUserId)
        excludedIds.push(triggeredByUserId);
    const supporters = await client_1.prisma.user.findMany({
        where: {
            origin: seededUser_service_1.USER_ORIGIN.REAL,
            id: { notIn: excludedIds },
            Push: { some: { taskId } },
        },
        select: { id: true, fcmToken: true },
    });
    if (!supporters.length)
        return;
    await client_1.prisma.notification.createMany({
        data: supporters.map((supporter) => ({
            userId: supporter.id,
            senderId: null,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_PUSHED_TASK_MILESTONE,
            taskType,
            message: (0, notificationTextCatalog_1.getPushedTaskMilestoneNotificationMessage)(pushCount, taskText),
            metadata: {
                taskId,
                taskText,
                pushCount,
            },
        })),
    });
    const { title, body } = (0, notificationTextCatalog_1.getPushedTaskMilestoneNotificationText)(pushCount);
    await Promise.all(supporters.map((supporter) => supporter.fcmToken
        ? (0, sendPushNotification_1.sendPushNotification)(supporter.fcmToken, title, body, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_PUSHED_TASK_MILESTONE,
            taskId,
            taskType,
            pushCount: String(pushCount),
            deeplinkPath: `/tasks/${taskId}`,
            screen: "TaskDetail",
        })
        : undefined));
}
