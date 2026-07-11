"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScheduledPush = createScheduledPush;
exports.cancelScheduledPushesForTask = cancelScheduledPushesForTask;
exports.runScheduledPushDispatch = runScheduledPushDispatch;
exports.startScheduledPushDispatcher = startScheduledPushDispatcher;
const client_1 = require("../../db/client");
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const DISPATCH_INTERVAL_MS = 60 * 1000;
let dispatchTimer = null;
let dispatchRunning = false;
async function createScheduledPush({ userId, taskId, deliverAt, title, body, data, }) {
    return client_1.prisma.scheduledPush.create({
        data: {
            userId,
            taskId,
            deliverAt,
            title,
            body,
            data,
        },
    });
}
// Cancels every pending (unsent) scheduled push tied to a task. Used when a
// task is deleted or its reminder time changes.
async function cancelScheduledPushesForTask(taskId, tx = client_1.prisma) {
    return tx.scheduledPush.updateMany({
        where: {
            taskId,
            sentAt: null,
            canceledAt: null,
        },
        data: { canceledAt: new Date() },
    });
}
async function dispatchDuePush(push) {
    // Claim the row first so a concurrent dispatcher never double-sends.
    const { count } = await client_1.prisma.scheduledPush.updateMany({
        where: { id: push.id, sentAt: null, canceledAt: null },
        data: { sentAt: new Date() },
    });
    if (count === 0)
        return;
    // Skip pushes whose task no longer exists or is already completed.
    if (push.taskId) {
        const task = await client_1.prisma.task.findUnique({
            where: { id: push.taskId },
            select: { completed: true },
        });
        if (!task || task.completed) {
            await client_1.prisma.scheduledPush.update({
                where: { id: push.id },
                data: { canceledAt: new Date() },
            });
            return;
        }
    }
    // Resolve the token at send time so token rotations between scheduling and
    // delivery still land on the right device.
    const user = await client_1.prisma.user.findUnique({
        where: { id: push.userId },
        select: { fcmToken: true },
    });
    if (!user?.fcmToken)
        return;
    const data = push.data && typeof push.data === "object" && !Array.isArray(push.data)
        ? Object.fromEntries(Object.entries(push.data).map(([key, value]) => [key, String(value)]))
        : undefined;
    await (0, sendPushNotification_1.sendPushNotification)(user.fcmToken, push.title, push.body, data);
}
async function runScheduledPushDispatch() {
    if (dispatchRunning)
        return;
    dispatchRunning = true;
    try {
        const duePushes = await client_1.prisma.scheduledPush.findMany({
            where: {
                deliverAt: { lte: new Date() },
                sentAt: null,
                canceledAt: null,
            },
            orderBy: { deliverAt: "asc" },
            select: {
                id: true,
                userId: true,
                taskId: true,
                title: true,
                body: true,
                data: true,
            },
        });
        for (const push of duePushes) {
            await dispatchDuePush(push);
        }
    }
    catch (error) {
        console.error("❌ Scheduled push dispatch failed", error);
    }
    finally {
        dispatchRunning = false;
    }
}
function startScheduledPushDispatcher() {
    if (dispatchTimer)
        return;
    // Run once at boot so pushes that came due while the server was down (or
    // mid-deploy) still go out.
    void runScheduledPushDispatch();
    dispatchTimer = setInterval(() => {
        void runScheduledPushDispatch();
    }, DISPATCH_INTERVAL_MS);
    dispatchTimer.unref?.();
}
