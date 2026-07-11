"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReminderNote = sendReminderNote;
exports.getRemindersByTask = getRemindersByTask;
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
const notificationTypes_1 = require("../../types/notificationTypes");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
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
            user: { select: { fcmToken: true } },
        },
    });
    if (!task)
        throw new errors_1.BadRequestError("Task not found.");
    if (task.userId === senderId)
        throw new errors_1.BadRequestError("You cannot remind yourself.");
    // Prevent duplicate reminders from same user — validated before any push
    // goes out so a rejected request never notifies the task owner.
    const existing = await client_1.prisma.reminderNote.findFirst({
        where: { taskId, senderId },
    });
    if (existing) {
        throw new errors_1.BadRequestError("You already sent a reminder for this task.");
    }
    const reminder = await client_1.prisma.reminderNote.create({
        data: { taskId, senderId, message },
    });
    // Notify task owner via push
    if (task.user?.fcmToken) {
        const { title, body } = (0, notificationTextCatalog_1.getReminderNoteNotificationText)(message);
        await (0, sendPushNotification_1.sendPushNotification)(task.user.fcmToken, title, body, {
            notificationType: "reminder",
            taskId,
            taskType: task.type,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${taskId}`,
        });
    }
    const sender = await client_1.prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true, photo: true },
    });
    // Create notification entry
    await client_1.prisma.notification.create({
        data: {
            userId: task.userId,
            senderId,
            type: notificationTypes_1.NOTIFICATION_TYPES.REMINDER,
            taskType: task.type,
            message: (0, notificationTextCatalog_1.getReminderReceivedNotificationMessage)(sender?.name ?? "Someone"),
            metadata: {
                taskId,
                senderId,
                taskText: task.text,
                senderName: sender?.name,
                senderPhoto: sender?.photo,
            },
        },
    });
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
