"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePushForTask = togglePushForTask;
exports.getPushesForTask = getPushesForTask;
const notification_service_1 = require("../notification/notification.service");
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
const AppError_1 = require("../../errors/AppError");
const httpStatus_1 = require("../../types/httpStatus");
// 💪 Create a push for a motivation task. Repeated calls are idempotent.
async function togglePushForTask({ userId, taskId, }) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, userId: true, type: true, createdAt: true, completed: true },
    });
    if (!task || task.type !== "motivation") {
        throw new AppError_1.AppError("Task not found or is not a motivation type", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.userId === userId) {
        throw new AppError_1.AppError("You cannot push your own task", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    if (task.completed) {
        throw new AppError_1.AppError("Completed tasks cannot receive pushes", httpStatus_1.HttpStatus.CONFLICT);
    }
    const existing = await client_1.prisma.push.findUnique({
        where: {
            userId_taskId: { userId, taskId },
        },
    });
    if (existing) {
        const pushCount = await client_1.prisma.push.count({
            where: { taskId, userId: { not: task.userId } },
        });
        return {
            hasPushed: true,
            pushCount,
        };
    }
    let pushCount;
    try {
        const pushedAt = new Date();
        pushCount = await client_1.prisma.$transaction(async (tx) => {
            const push = await tx.push.create({
                data: { userId, taskId, createdAt: pushedAt },
                select: { createdAt: true },
            });
            const nextCount = await tx.push.count({
                where: { taskId, userId: { not: task.userId } },
            });
            await tx.task.update({
                where: { id: taskId },
                data: {
                    pushCount: nextCount,
                    latestActivityAt: push.createdAt,
                    isAlmostThere: nextCount >= 3,
                },
            });
            return nextCount;
        });
    }
    catch (error) {
        if (error instanceof client_2.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002") {
            pushCount = await client_1.prisma.push.count({
                where: { taskId, userId: { not: task.userId } },
            });
            return {
                hasPushed: true,
                pushCount,
            };
        }
        throw error;
    }
    await (0, notification_service_1.createMotivationPushNotification)({
        taskId,
        taskOwnerId: task.userId,
        pushedByUserId: userId,
    });
    await (0, notification_service_1.createMotivationMilestoneNotification)({
        taskId,
        taskOwnerId: task.userId,
        pushCount,
    });
    return {
        hasPushed: true,
        pushCount,
    };
}
// 📊 Get all pushes for a task (optional, mirrors getVotesForTask)
async function getPushesForTask(taskId, userId) {
    const [pushCount, existing] = await Promise.all([
        client_1.prisma.task
            .findUnique({
            where: { id: taskId },
            select: { userId: true },
        })
            .then((task) => client_1.prisma.push.count({
            where: {
                taskId,
                ...(task ? { userId: { not: task.userId } } : {}),
            },
        })),
        client_1.prisma.push.findUnique({
            where: {
                userId_taskId: { userId, taskId },
            },
        }),
    ]);
    return {
        hasPushed: !!existing,
        pushCount,
    };
}
