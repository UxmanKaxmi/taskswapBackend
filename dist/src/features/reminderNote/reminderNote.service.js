"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReminderNote = sendReminderNote;
exports.getRemindersByTask = getRemindersByTask;
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
const notificationTypes_1 = require("../../types/notificationTypes");
const seededUser_service_1 = require("../seededUser/seededUser.service");
async function sendReminderNote({ taskId, senderId, message, }) {
    if (!message?.trim()) {
        throw new errors_1.BadRequestError("Reminder message cannot be empty.");
    }
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            userId: true,
            text: true,
            type: true,
            user: { select: { fcmToken: true, origin: true } },
        },
    });
    if (!task)
        throw new errors_1.BadRequestError("Task not found.");
    if (task.userId === senderId)
        throw new errors_1.BadRequestError("You cannot remind yourself.");
    // Notify task owner via push
    if (task.user?.fcmToken && task.user.origin === seededUser_service_1.USER_ORIGIN.REAL) {
        await (0, sendPushNotification_1.sendPushNotification)(task.user.fcmToken, "⏰ You got a reminder!", message, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.REMINDER,
            taskId,
            taskType: task.type,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
        });
    }
    // Prevent duplicate reminders from same user
    const existing = await client_1.prisma.reminderNote.findFirst({
        where: { taskId, senderId },
    });
    if (existing) {
        throw new errors_1.BadRequestError("You already sent a reminder for this task.");
    }
    const reminder = await client_1.prisma.reminderNote.create({
        data: { taskId, senderId, message },
    });
    const sender = await client_1.prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true, photo: true },
    });
    if (task.user.origin === seededUser_service_1.USER_ORIGIN.REAL) {
        // Create notification entry
        await client_1.prisma.notification.create({
            data: {
                userId: task.userId,
                senderId,
                type: notificationTypes_1.NOTIFICATION_TYPES.REMINDER,
                taskType: task.type,
                message: `${sender?.name ?? "Someone"} reminded you about your task.`,
                metadata: {
                    taskId,
                    senderId,
                    taskText: task.text,
                    senderName: sender?.name,
                    senderPhoto: sender?.photo,
                },
            },
        });
    }
    return reminder;
}
async function getRemindersByTask(taskId, userId) {
    const notes = await client_1.prisma.reminderNote.findMany({
        where: { taskId },
        orderBy: { createdAt: "desc" },
        include: {
            sender: { select: { name: true, photo: true } },
        },
    });
    return notes.map((note) => {
        const isSenderCurrentUser = !!userId && note.senderId === userId;
        return {
            id: note.id,
            taskId: note.taskId,
            senderId: note.senderId,
            message: note.message,
            createdAt: note.createdAt.toISOString(),
            senderName: note.sender?.name ?? "Unknown",
            isSenderCurrentUser,
            senderPhoto: note.sender?.photo ?? null,
        };
    });
}
