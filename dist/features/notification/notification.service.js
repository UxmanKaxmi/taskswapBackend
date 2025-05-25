"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNotifications = getUserNotifications;
exports.markNotificationAsRead = markNotificationAsRead;
exports.sendTestNotification = sendTestNotification;
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const client_1 = require("../../db/client");
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
async function markNotificationAsRead(notificationId) {
    return client_1.prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
    });
}
async function sendTestNotification(userId, title, body) {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true }, // ✅ Will work only if schema has this field
    });
    console.log("🎯 Token:", user?.fcmToken);
    if (!user?.fcmToken) {
        throw new Error("User or FCM token not found");
    }
    await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, title, body);
}
