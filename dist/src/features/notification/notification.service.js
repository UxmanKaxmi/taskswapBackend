"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNotifications = getUserNotifications;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markNotificationsAsRead = markNotificationsAsRead;
exports.sendTestNotification = sendTestNotification;
exports.createTaskHelperNotifications = createTaskHelperNotifications;
exports.createDecisionTaskDoneNotifications = createDecisionTaskDoneNotifications;
exports.sendTestDecisionDoneNotification = sendTestDecisionDoneNotification;
exports.createCommentMentionNotifications = createCommentMentionNotifications;
const notificationTypes_1 = require("../../types/notificationTypes");
const client_1 = require("../../db/client");
const sendPushNotification_1 = require("../../utils/sendPushNotification");
// 📨 Get notifications for the logged-in user
async function getUserNotifications(userId) {
    return client_1.prisma.notification.findMany({
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
    await client_1.prisma.notification.createMany({
        data: helperIds.map((helperId) => ({
            userId: helperId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_HELPER,
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
    await client_1.prisma.notification.createMany({
        data: helperIds.map((helperId) => ({
            userId: helperId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.DECISION_DONE,
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
async function createCommentMentionNotifications({ mentionedIds, senderId, taskId, commentId, commentText, }) {
    if (!mentionedIds.length)
        return;
    await client_1.prisma.notification.createMany({
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
