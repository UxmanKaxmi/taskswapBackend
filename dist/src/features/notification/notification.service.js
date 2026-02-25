"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNotifications = getUserNotifications;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markNotificationsAsRead = markNotificationsAsRead;
exports.sendTestNotification = sendTestNotification;
exports.createTaskHelperNotifications = createTaskHelperNotifications;
exports.createDecisionTaskDoneNotifications = createDecisionTaskDoneNotifications;
exports.sendTestDecisionDoneNotification = sendTestDecisionDoneNotification;
exports.createTaskAdviceNotification = createTaskAdviceNotification;
exports.createCommentMentionNotifications = createCommentMentionNotifications;
exports.createMotivationPushNotification = createMotivationPushNotification;
exports.createMotivationMilestoneNotification = createMotivationMilestoneNotification;
const notificationTypes_1 = require("../../types/notificationTypes");
const client_1 = require("../../db/client");
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const MOTIVATION_PUSH_MILESTONES = [10, 100, 500, 1000];
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
// 🔔 Send a test push notification to a user
async function sendTestNotification(userId, title = "Test Notification", body = "🚀 This is a test.") {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true },
    });
    console.log("🎯 Token:", user?.fcmToken);
    if (!user?.fcmToken) {
        throw new Error("User or FCM token not found");
    }
    await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, title, body);
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
            message: `marked the decision “${taskText}” as done.`,
            metadata: {
                taskId,
                taskText,
            },
        })),
    });
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
            message: "pushed your motivation 💪",
            metadata: {
                taskId,
                taskText: task.text,
            },
        },
    });
}
async function createMotivationMilestoneNotification({ taskId, taskOwnerId, pushCount, }) {
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
        await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, "🔥 Motivation milestone!", `Your motivation just reached ${pushCount} pushes`);
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
