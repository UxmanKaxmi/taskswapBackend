"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePushForTask = togglePushForTask;
exports.getPushesForTask = getPushesForTask;
const notification_service_1 = require("../notification/notification.service");
const client_1 = require("../../db/client");
// 💪 Toggle push for a motivation task
async function togglePushForTask({ userId, taskId, }) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, userId: true, type: true },
    });
    if (!task || task.type !== "motivation") {
        throw new Error("Task not found or is not a motivation type");
    }
    const existing = await client_1.prisma.push.findUnique({
        where: {
            userId_taskId: { userId, taskId },
        },
    });
    let hasPushed;
    let pushCount;
    if (existing) {
        // 👎 Removing a push → NO notifications
        await client_1.prisma.push.delete({
            where: { id: existing.id },
        });
        pushCount = await client_1.prisma.push.count({ where: { taskId } });
        hasPushed = false;
    }
    else {
        // 👍 Adding a push
        await client_1.prisma.push.create({
            data: { userId, taskId },
        });
        pushCount = await client_1.prisma.push.count({ where: { taskId } });
        hasPushed = true;
        // 🔔 Normal motivation push notification (skip self)
        await (0, notification_service_1.createMotivationPushNotification)({
            taskId,
            taskOwnerId: task.userId,
            pushedByUserId: userId,
        });
        // 🔥 Milestone check (skip self, use actual count)
        if (userId !== task.userId) {
            await (0, notification_service_1.createMotivationMilestoneNotification)({
                taskId,
                taskOwnerId: task.userId,
                pushCount,
            });
        }
    }
    return {
        hasPushed,
        pushCount,
    };
}
// 📊 Get all pushes for a task (optional, mirrors getVotesForTask)
async function getPushesForTask(taskId, userId) {
    const [pushCount, existing] = await Promise.all([
        client_1.prisma.push.count({
            where: { taskId },
        }),
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
