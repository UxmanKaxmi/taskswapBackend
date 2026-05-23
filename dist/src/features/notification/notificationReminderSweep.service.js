"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNotificationReminderSweep = runNotificationReminderSweep;
exports.startNotificationReminderSweep = startNotificationReminderSweep;
const client_1 = require("../../db/client");
const notificationTypes_1 = require("../../types/notificationTypes");
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const seededUser_service_1 = require("../seededUser/seededUser.service");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const SWEEP_INTERVAL_MS = HOUR_MS;
const UNFINISHED_REMINDER_AFTER_MS = DAY_MS;
const HELP_PUSH_REMINDER_AFTER_MS = 3 * DAY_MS;
const UNFINISHED_REMINDER_MAX_PER_TASK = 3;
const HELP_PUSH_REMINDER_MAX_PER_WEEK = 2;
const HELP_PUSH_REMINDER_COOLDOWN_MS = 4 * DAY_MS;
let sweepRunning = false;
let sweepTimer = null;
function buildTaskMetadata(taskId, taskText) {
    return {
        taskId,
        taskText,
    };
}
function buildInactivityNotificationWhere(userId, taskId) {
    return {
        userId,
        type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_UNFINISHED_REMINDER,
        metadata: {
            path: ["taskId"],
            equals: taskId,
        },
    };
}
async function sendUnfinishedMotivationReminder(user, task) {
    const message = `Your motivation "${task.text}" still needs attention.`;
    await client_1.prisma.notification.create({
        data: {
            userId: user.id,
            senderId: null,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_UNFINISHED_REMINDER,
            taskType: "motivation",
            message,
            metadata: buildTaskMetadata(task.id, task.text),
        },
    });
    if (user.fcmToken) {
        await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, "Keep going", message, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_UNFINISHED_REMINDER,
            taskId: task.id,
            taskType: "motivation",
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${task.id}`,
        });
    }
}
async function sendHelpPushReminder(user, taskCount) {
    const message = taskCount === 1
        ? "One motivation task is waiting for your push."
        : `${taskCount} motivation tasks are waiting for your push.`;
    await client_1.prisma.notification.create({
        data: {
            userId: user.id,
            senderId: null,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
            taskType: "motivation",
            message,
            metadata: {
                taskCount,
            },
        },
    });
    if (user.fcmToken) {
        await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, "Help someone push", message, {
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
            taskType: "motivation",
            screen: "Home",
            deeplinkPath: "/",
        });
    }
}
async function maybeSendUnfinishedMotivationReminder(user) {
    if (!user.lastOpenedAt)
        return;
    const inactivityMs = Date.now() - user.lastOpenedAt.getTime();
    if (inactivityMs < UNFINISHED_REMINDER_AFTER_MS)
        return;
    const activeTasks = await client_1.prisma.task.findMany({
        where: {
            userId: user.id,
            type: "motivation",
            completed: false,
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            text: true,
        },
    });
    for (const task of activeTasks) {
        const where = buildInactivityNotificationWhere(user.id, task.id);
        const sentCount = await client_1.prisma.notification.count({ where });
        if (sentCount >= UNFINISHED_REMINDER_MAX_PER_TASK) {
            continue;
        }
        const lastSent = await client_1.prisma.notification.findFirst({
            where,
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        });
        if (lastSent && Date.now() - lastSent.createdAt.getTime() < DAY_MS) {
            continue;
        }
        await sendUnfinishedMotivationReminder(user, task);
        return;
    }
}
async function maybeSendHelpPushReminder(user) {
    if (!user.lastOpenedAt)
        return;
    const inactivityMs = Date.now() - user.lastOpenedAt.getTime();
    if (inactivityMs < HELP_PUSH_REMINDER_AFTER_MS)
        return;
    const reminderCount = await client_1.prisma.notification.count({
        where: {
            userId: user.id,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
            createdAt: {
                gte: new Date(Date.now() - WEEK_MS),
            },
        },
    });
    if (reminderCount >= HELP_PUSH_REMINDER_MAX_PER_WEEK)
        return;
    const lastSent = await client_1.prisma.notification.findFirst({
        where: {
            userId: user.id,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    if (lastSent && Date.now() - lastSent.createdAt.getTime() < HELP_PUSH_REMINDER_COOLDOWN_MS) {
        return;
    }
    const followedUserIds = await client_1.prisma.follow.findMany({
        where: { followerId: user.id },
        select: { followingId: true },
    });
    if (!followedUserIds.length)
        return;
    const taskCount = await client_1.prisma.task.count({
        where: {
            type: "motivation",
            completed: false,
            userId: { in: followedUserIds.map((row) => row.followingId) },
            Push: {
                none: {},
            },
        },
    });
    if (!taskCount)
        return;
    await sendHelpPushReminder(user, taskCount);
}
async function runNotificationReminderSweep() {
    if (sweepRunning)
        return;
    sweepRunning = true;
    try {
        const unfinishedCutoff = new Date(Date.now() - UNFINISHED_REMINDER_AFTER_MS);
        const helpPushCutoff = new Date(Date.now() - HELP_PUSH_REMINDER_AFTER_MS);
        const unfinishedUsers = await client_1.prisma.user.findMany({
            where: {
                origin: seededUser_service_1.USER_ORIGIN.REAL,
                lastOpenedAt: {
                    not: null,
                    lt: unfinishedCutoff,
                },
            },
            select: {
                id: true,
                name: true,
                fcmToken: true,
                lastOpenedAt: true,
            },
            orderBy: {
                lastOpenedAt: "asc",
            },
        });
        const helpPushUsers = await client_1.prisma.user.findMany({
            where: {
                origin: seededUser_service_1.USER_ORIGIN.REAL,
                lastOpenedAt: {
                    not: null,
                    lt: helpPushCutoff,
                },
            },
            select: {
                id: true,
                name: true,
                fcmToken: true,
                lastOpenedAt: true,
            },
            orderBy: {
                lastOpenedAt: "asc",
            },
        });
        for (const user of unfinishedUsers) {
            await maybeSendUnfinishedMotivationReminder(user);
        }
        for (const user of helpPushUsers) {
            await maybeSendHelpPushReminder(user);
        }
    }
    catch (error) {
        console.error("❌ Reminder sweep failed", error);
    }
    finally {
        sweepRunning = false;
    }
}
function startNotificationReminderSweep() {
    if (sweepTimer)
        return;
    void runNotificationReminderSweep();
    sweepTimer = setInterval(() => {
        void runNotificationReminderSweep();
    }, SWEEP_INTERVAL_MS);
    sweepTimer.unref?.();
}
