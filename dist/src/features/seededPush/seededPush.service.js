"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUSH_SOURCE = void 0;
exports.createSeededPushesForTask = createSeededPushesForTask;
exports.scheduleSeededPushesForTask = scheduleSeededPushesForTask;
const client_1 = require("@prisma/client");
const client_2 = require("../../db/client");
const notification_service_1 = require("../notification/notification.service");
const seededUser_service_1 = require("../seededUser/seededUser.service");
exports.PUSH_SOURCE = {
    REAL: "real",
    SEEDED: "seeded",
};
const seededPushMessages = [
    "One small step today. You've got this.",
    "Don't overthink it. Just start with 5 minutes.",
    "I'm rooting for you. Make the next step tiny.",
    "You don't need perfect. Just show up once.",
    "Start small and send an update after.",
    "Make it easy enough to begin.",
    "A tiny start still counts.",
    "Try one focused round and see how it feels.",
    "Keep it simple. One next step.",
    "You can build momentum from here.",
];
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_SEEDED_PUSHES_PER_TASK = 10;
const seededPushDelayWindowsMs = [
    [1 * MINUTE_MS, 3 * MINUTE_MS],
    [10 * MINUTE_MS, 25 * MINUTE_MS],
    [45 * MINUTE_MS, 90 * MINUTE_MS],
    [2 * HOUR_MS, 4 * HOUR_MS],
    [5 * HOUR_MS, 8 * HOUR_MS],
    [9 * HOUR_MS, 14 * HOUR_MS],
    [15 * HOUR_MS, 22 * HOUR_MS],
    [24 * HOUR_MS, 34 * HOUR_MS],
    [36 * HOUR_MS, 48 * HOUR_MS],
    [54 * HOUR_MS, 72 * HOUR_MS],
];
function getSeededPushConfig() {
    const enabled = process.env.SEEDED_PUSHES_ENABLED === "true";
    const min = Number.parseInt(process.env.SEEDED_PUSH_MIN ?? "1", 10);
    const max = Number.parseInt(process.env.SEEDED_PUSH_MAX ?? "3", 10);
    const normalizedMin = Number.isFinite(min) ? Math.max(0, min) : 1;
    const normalizedMax = Number.isFinite(max) ? Math.max(normalizedMin, max) : 3;
    const cappedMax = Math.min(normalizedMax, MAX_SEEDED_PUSHES_PER_TASK);
    return {
        enabled,
        min: Math.min(normalizedMin, cappedMax),
        max: cappedMax,
    };
}
function randomInt(min, max) {
    if (max <= min)
        return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}
function randomMessage() {
    return seededPushMessages[randomInt(0, seededPushMessages.length - 1)];
}
async function getEligibleSeededPushPlan(taskId) {
    const config = getSeededPushConfig();
    if (!config.enabled || config.max <= 0) {
        return { task: null, selected: [], skipped: "disabled" };
    }
    const task = await client_2.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            type: true,
            isPublic: true,
            completed: true,
            deliverAt: true,
            user: {
                select: {
                    origin: true,
                },
            },
            _count: {
                select: {
                    Push: true,
                },
            },
            Push: {
                where: { source: exports.PUSH_SOURCE.SEEDED },
                select: { userId: true },
            },
        },
    });
    if (!task)
        return { task: null, selected: [], skipped: "missing-task" };
    if (task.type !== "motivation")
        return { task, selected: [], skipped: "non-motivation" };
    if (task.user.origin !== seededUser_service_1.USER_ORIGIN.REAL)
        return { task, selected: [], skipped: "non-real-owner" };
    if (!task.isPublic || task.completed)
        return { task, selected: [], skipped: "inactive-task" };
    if (task.deliverAt && task.deliverAt.getTime() < Date.now()) {
        return { task, selected: [], skipped: "expired-task" };
    }
    const existingSeededPusherIds = new Set(task.Push.map((push) => push.userId));
    if (existingSeededPusherIds.size >= config.max || task._count.Push >= config.max) {
        return { task, selected: [], skipped: "enough-pushes" };
    }
    const targetCount = randomInt(config.min, config.max);
    const availableSlots = Math.min(targetCount - existingSeededPusherIds.size, config.max - existingSeededPusherIds.size, config.max - task._count.Push);
    if (availableSlots <= 0) {
        return { task, selected: [], skipped: "no-slots" };
    }
    const candidates = await client_2.prisma.user.findMany({
        where: {
            origin: seededUser_service_1.USER_ORIGIN.SEEDED,
            id: {
                not: task.userId,
                notIn: [...existingSeededPusherIds],
            },
        },
        select: { id: true },
        orderBy: { id: "asc" },
    });
    const selected = shuffled(candidates).slice(0, availableSlots);
    return { task, selected, skipped: null };
}
async function createSeededPushForTaskUser({ taskId, pusherId, maxSeededPushes, }) {
    const task = await client_2.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            type: true,
            isPublic: true,
            completed: true,
            deliverAt: true,
            user: {
                select: {
                    origin: true,
                },
            },
        },
    });
    if (!task)
        return false;
    if (task.type !== "motivation")
        return false;
    if (task.user.origin !== seededUser_service_1.USER_ORIGIN.REAL)
        return false;
    if (!task.isPublic || task.completed)
        return false;
    if (task.deliverAt && task.deliverAt.getTime() < Date.now())
        return false;
    if (task.userId === pusherId)
        return false;
    const [existing, seededPushCount, totalPushCount] = await Promise.all([
        client_2.prisma.push.findUnique({
            where: {
                userId_taskId: { userId: pusherId, taskId },
            },
            select: { id: true },
        }),
        client_2.prisma.push.count({
            where: { taskId, source: exports.PUSH_SOURCE.SEEDED },
        }),
        client_2.prisma.push.count({
            where: { taskId },
        }),
    ]);
    if (existing)
        return false;
    if (seededPushCount >= maxSeededPushes || totalPushCount >= maxSeededPushes)
        return false;
    try {
        await client_2.prisma.push.create({
            data: {
                taskId,
                userId: pusherId,
                source: exports.PUSH_SOURCE.SEEDED,
                message: randomMessage(),
            },
        });
        await (0, notification_service_1.createMotivationPushNotification)({
            taskId,
            taskOwnerId: task.userId,
            pushedByUserId: pusherId,
        });
        const pushCount = await client_2.prisma.push.count({ where: { taskId } });
        await (0, notification_service_1.createMotivationMilestoneNotification)({
            taskId,
            taskOwnerId: task.userId,
            pushCount,
        });
        return true;
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002") {
            return false;
        }
        throw error;
    }
}
async function createSeededPushesForTask(taskId) {
    const config = getSeededPushConfig();
    const { selected, skipped } = await getEligibleSeededPushPlan(taskId);
    if (skipped) {
        return { created: 0, skipped };
    }
    let created = 0;
    for (const candidate of selected) {
        const wasCreated = await createSeededPushForTaskUser({
            taskId,
            pusherId: candidate.id,
            maxSeededPushes: config.max,
        });
        if (wasCreated) {
            created++;
        }
    }
    return { created, skipped: null };
}
async function scheduleSeededPushesForTask(taskId) {
    const config = getSeededPushConfig();
    const { selected, skipped } = await getEligibleSeededPushPlan(taskId);
    if (skipped) {
        return { scheduled: 0, skipped };
    }
    selected.forEach((candidate, index) => {
        const [minDelay, maxDelay] = seededPushDelayWindowsMs[index] ??
            seededPushDelayWindowsMs[seededPushDelayWindowsMs.length - 1];
        const delayMs = randomInt(minDelay, maxDelay);
        const timeout = setTimeout(() => {
            createSeededPushForTaskUser({
                taskId,
                pusherId: candidate.id,
                maxSeededPushes: config.max,
            }).catch((error) => {
                console.error("[SEEDED_PUSH_SCHEDULE_ERROR]", {
                    taskId,
                    pusherId: candidate.id,
                    error: error instanceof Error ? error.message : error,
                });
            });
        }, delayMs);
        timeout.unref?.();
    });
    return { scheduled: selected.length, skipped: null };
}
