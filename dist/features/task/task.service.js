"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.getAllTasks = getAllTasks;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.markTaskAsDone = markTaskAsDone;
exports.markTaskAsNotDone = markTaskAsNotDone;
const AppError_1 = require("../../errors/AppError");
const client_1 = require("../../db/client");
const httpStatus_1 = require("../../types/httpStatus");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
async function checkDuplicateTask(text, userId, excludeId) {
    return client_1.prisma.task.findFirst({
        where: {
            text,
            userId,
            NOT: excludeId ? { id: excludeId } : undefined,
        },
    });
}
async function createTask(input) {
    const { text, userId, type } = input;
    const existing = await checkDuplicateTask(text, userId);
    if (existing) {
        throw new AppError_1.AppError("You already created this task.", httpStatus_1.HttpStatus.CONFLICT);
    }
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, photo: true, fcmToken: true },
    });
    if (!user) {
        throw new AppError_1.AppError("User not found. Cannot create task without a valid user.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    const avatar = input.avatar ?? user.photo ?? undefined;
    const name = user.name;
    const remindAt = type === "reminder" ? input.remindAt : undefined;
    const createdTask = await client_1.prisma.task.create({
        data: {
            text,
            type,
            userId,
            avatar,
            name,
            remindAt,
            options: type === "decision" ? input.options : [],
            deliverAt: type === "motivation"
                ? input.deliverAt ?? undefined
                : undefined,
        },
    });
    // ✅ Schedule push if reminder task with valid time
    if (type === "reminder" && remindAt) {
        const delayMs = new Date(remindAt).getTime() - Date.now();
        if (delayMs > 0 && user.fcmToken) {
            (0, scheduleReminderPush_1.schedulePush)(delayMs, user.fcmToken, "✅ Reminder Complete", `It’s time to act on your task: “${text}”`);
        }
    }
    return createdTask;
}
async function getAllTasks(userId) {
    // Step 1: Get IDs of people the user follows
    const followings = await client_1.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
    });
    const followingIds = followings.map((f) => f.followingId);
    // Step 2: Get tasks by self + followed users
    const tasks = await client_1.prisma.task.findMany({
        where: {
            userId: {
                in: [userId, ...followingIds],
            },
        },
        orderBy: { createdAt: "desc" },
    });
    // Step 3: Get all reminder notes sent by current user
    const reminders = await client_1.prisma.reminderNote.findMany({
        where: { senderId: userId },
        select: { taskId: true },
    });
    const remindedTaskIds = new Set(reminders.map((r) => r.taskId));
    // Step 4: Mark each task if user has reminded it
    return tasks.map((task) => ({
        ...task,
        hasReminded: remindedTaskIds.has(task.id),
    }));
}
async function updateTask(id, data) {
    const currentTask = await client_1.prisma.task.findUnique({
        where: { id },
        select: { userId: true },
    });
    if (!currentTask) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (data.text) {
        const duplicate = await checkDuplicateTask(data.text, currentTask.userId, id);
        if (duplicate) {
            throw new AppError_1.AppError("You already have another task with the same text.", httpStatus_1.HttpStatus.CONFLICT);
        }
    }
    const dataToUpdate = {
        text: data.text,
        type: data.type,
        name: data.name,
        remindAt: data.type === "reminder" ? data.remindAt ?? undefined : undefined,
        options: data.type === "decision" ? data.options ?? [] : [],
        deliverAt: data.type === "motivation" ? data.deliverAt ?? undefined : undefined,
        avatar: data.avatar ?? undefined,
    };
    return client_1.prisma.task.update({
        where: { id },
        data: dataToUpdate,
    });
}
async function deleteTask(id) {
    const existing = await client_1.prisma.task.findUnique({
        where: { id },
    });
    if (!existing) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    return client_1.prisma.task.delete({
        where: { id },
    });
}
async function markTaskAsDone(taskId, userId) {
    console.log("[LOOKUP] task ID:", taskId);
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
    });
    if (!task) {
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.type !== "reminder") {
        throw new AppError_1.AppError("Only reminder tasks can be marked as done", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    if (task.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized to mark this task", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { completed: true },
    });
}
async function markTaskAsNotDone(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
    });
    if (!task) {
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.type !== "reminder") {
        throw new AppError_1.AppError("Only reminder tasks can be marked as done", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    if (task.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized to mark this task", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { completed: false },
    });
}
