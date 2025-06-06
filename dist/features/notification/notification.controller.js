"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetNotifications = handleGetNotifications;
exports.handleMarkNotificationAsRead = handleMarkNotificationAsRead;
exports.handleBatchMarkNotificationsAsRead = handleBatchMarkNotificationsAsRead;
exports.handleTestSendNotification = handleTestSendNotification;
const notification_service_1 = require("./notification.service");
async function handleGetNotifications(req, res, next) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(400).json({ message: "Missing userId" });
            return;
        }
        const notifications = await (0, notification_service_1.getUserNotifications)(userId);
        res.status(200).json(notifications);
    }
    catch (error) {
        next(error);
    }
}
async function handleMarkNotificationAsRead(req, res, next) {
    try {
        const notificationId = req.params.id;
        const result = await (0, notification_service_1.markNotificationAsRead)(notificationId);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
}
// ✅ Mark multiple notifications as read
async function handleBatchMarkNotificationsAsRead(req, res, next) {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: "Invalid or missing 'ids' array" });
        }
        await (0, notification_service_1.markNotificationsAsRead)(ids);
        res.status(200).json({ message: "Notifications marked as read" });
    }
    catch (error) {
        next(error);
    }
}
async function handleTestSendNotification(req, res, next) {
    try {
        const { userId, title = "Test Notification", body = "🚀 This is a test.", } = req.body;
        if (!userId) {
            res.status(400).json({ message: "Missing userId" });
            return;
        }
        await (0, notification_service_1.sendTestNotification)(userId, title, body);
        res.status(200).json({ message: "Notification sent successfully" });
    }
    catch (error) {
        console.error("❌ Failed to send test notification:", error);
        next(error);
    }
}
