"use strict";
// src/features/reminderNote/reminderNote.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReminderNote = sendReminderNote;
exports.getRemindersByTask = getRemindersByTask;
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
async function sendReminderNote({ taskId, senderId, message, }) {
    if (!message?.trim()) {
        throw new errors_1.BadRequestError("Reminder message cannot be empty.");
    }
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            userId: true,
            text: true,
            user: {
                select: { fcmToken: true },
            },
        },
    });
    if (!task) {
        throw new errors_1.BadRequestError("Task not found.");
    }
    if (task.userId === senderId) {
        throw new errors_1.BadRequestError("You cannot remind yourself.");
    }
    if (task.user?.fcmToken) {
        await (0, sendPushNotification_1.sendPushNotification)(task.user.fcmToken, "⏰ You got a reminder!", message);
    }
    if (!task) {
        throw new errors_1.BadRequestError("Task not found.");
    }
    if (task.userId === senderId) {
        throw new errors_1.BadRequestError("You cannot remind yourself.");
    }
    const existing = await client_1.prisma.reminderNote.findFirst({
        where: {
            taskId,
            senderId,
        },
    });
    if (existing) {
        throw new errors_1.BadRequestError("You already sent a reminder for this task.");
    }
    const reminder = await client_1.prisma.reminderNote.create({
        data: {
            taskId,
            senderId,
            message,
        },
    });
    const sender = await client_1.prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true, photo: true },
    });
    if (!sender) {
        throw new errors_1.BadRequestError("Sender not found.");
    }
    // ✅ Send notification to task owner
    await client_1.prisma.notification.create({
        data: {
            userId: task.userId,
            senderId,
            type: "reminder",
            message: `${sender?.name ?? "Someone"} reminded you about your task.`,
            metadata: {
                taskId,
                senderId,
                taskText: task.text,
                senderName: sender.name,
                senderPhoto: sender.photo,
            },
        },
    });
    return reminder;
}
async function getRemindersByTask(taskId, userId) {
    const notes = await client_1.prisma.reminderNote.findMany({
        where: { taskId },
        orderBy: { createdAt: "desc" },
    });
    return notes.map((note) => ({
        id: note.id,
        taskId: note.taskId,
        senderId: note.senderId,
        message: note.message,
        createdAt: note.createdAt.toISOString(),
    }));
}
