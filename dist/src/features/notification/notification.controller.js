"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetNotifications = handleGetNotifications;
exports.handleMarkNotificationAsRead = handleMarkNotificationAsRead;
exports.handleBatchMarkNotificationsAsRead = handleBatchMarkNotificationsAsRead;
const params_1 = require("../../utils/params");
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
        const notificationId = (0, params_1.getParamString)(req.params.id);
        if (!notificationId) {
            res.status(400).json({ message: "Missing notificationId" });
            return;
        }
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
