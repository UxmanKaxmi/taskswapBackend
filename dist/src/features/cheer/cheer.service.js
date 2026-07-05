"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTaskCheerSummaryForTask = getTaskCheerSummaryForTask;
exports.cheerBeat = cheerBeat;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../errors/AppError");
const client_2 = require("../../db/client");
const httpStatus_1 = require("../../types/httpStatus");
const notificationTypes_1 = require("../../types/notificationTypes");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
const cheer_presets_1 = require("./cheer.presets");
const moderation_service_1 = require("../moderation/moderation.service");
const CHEER_SAMPLE_SIZE = 3;
const CHEER_NOTIFICATION_GROUP_MS = 30 * 60 * 1000;
function isKnownPrismaError(error, code) {
    return (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
        error.code === code);
}
function toAvatarUser(user) {
    return {
        id: user.id,
        name: user.name,
        photo: user.photo ?? null,
    };
}
function compareBeatRecency(left, right) {
    const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();
    if (timeDiff !== 0)
        return timeDiff;
    return left.id.localeCompare(right.id);
}
async function getTaskCheerSummaryForTask(taskId, callerId, db = client_2.prisma) {
    const task = await db.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            completed: true,
            beats: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    type: true,
                    updateId: true,
                    createdAt: true,
                    cheers: {
                        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                        select: {
                            id: true,
                            userId: true,
                            presetKey: true,
                            presetTextSnapshot: true,
                            createdAt: true,
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    photo: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!task) {
        return {
            beats: [],
            cheerTotal: 0,
            distinctCheererCount: 0,
            sampleCheerers: [],
            mostCheeredBeatId: null,
        };
    }
    const beats = task.beats;
    const latestBeat = beats.reduce((latest, beat) => {
        if (!latest)
            return beat;
        return compareBeatRecency(beat, latest) > 0 ? beat : latest;
    }, null);
    const cheerCountsByBeat = new Map();
    const distinctCheerers = new Map();
    let cheerTotal = 0;
    for (const beat of beats) {
        const cheers = beat.cheers.filter((cheer) => cheer.userId !== task.userId);
        cheerCountsByBeat.set(beat.id, cheers.length);
        cheerTotal += cheers.length;
        for (const cheer of cheers) {
            if (!distinctCheerers.has(cheer.user.id)) {
                distinctCheerers.set(cheer.user.id, toAvatarUser(cheer.user));
            }
        }
    }
    const mostCheeredBeat = beats.reduce((current, beat) => {
        const beatCount = cheerCountsByBeat.get(beat.id) ?? 0;
        if (beatCount === 0)
            return current;
        if (!current)
            return beat;
        const currentCount = cheerCountsByBeat.get(current.id) ?? 0;
        if (beatCount > currentCount)
            return beat;
        if (beatCount < currentCount)
            return current;
        return compareBeatRecency(beat, current) > 0 ? beat : current;
    }, null);
    const mostCheeredBeatId = mostCheeredBeat?.id ?? null;
    return {
        beats: beats.map((beat) => {
            const cheers = beat.cheers.filter((cheer) => cheer.userId !== task.userId);
            const callerCheer = callerId
                ? cheers.find((cheer) => cheer.userId === callerId)
                : undefined;
            const state = {
                beatId: beat.id,
                type: beat.type,
                updateId: beat.updateId,
                createdAt: beat.createdAt.toISOString(),
                isLatest: latestBeat?.id === beat.id,
                isCheeringOpen: !task.completed && latestBeat?.id === beat.id,
                cheerCount: cheers.length,
                sampleCheerers: cheers.slice(0, CHEER_SAMPLE_SIZE).map((cheer) => toAvatarUser(cheer.user)),
                callerHasCheered: Boolean(callerCheer),
                isMostCheered: mostCheeredBeatId === beat.id,
            };
            if (callerCheer) {
                state.callerCheer = {
                    presetKey: callerCheer.presetKey,
                    presetText: callerCheer.presetTextSnapshot,
                    createdAt: callerCheer.createdAt.toISOString(),
                };
            }
            return state;
        }),
        cheerTotal,
        distinctCheererCount: distinctCheerers.size,
        sampleCheerers: [...distinctCheerers.values()].slice(0, CHEER_SAMPLE_SIZE),
        mostCheeredBeatId,
    };
}
async function createOrUpdateCheerNotification(tx, { taskId, taskType, beatId, updateId, beatType, ownerId, cheererId, }) {
    if (ownerId === cheererId)
        return null;
    const [owner, cheerer] = await Promise.all([
        tx.user.findUnique({
            where: { id: ownerId },
            select: { fcmToken: true },
        }),
        tx.user.findUnique({
            where: { id: cheererId },
            select: { name: true },
        }),
    ]);
    if (!cheerer)
        return null;
    const cutoff = new Date(Date.now() - CHEER_NOTIFICATION_GROUP_MS);
    const existingNotification = await tx.notification.findFirst({
        where: {
            userId: ownerId,
            type: notificationTypes_1.NOTIFICATION_TYPES.TASK_CHEER,
            createdAt: { gte: cutoff },
            AND: [
                { metadata: { path: ["taskId"], equals: taskId } },
                { metadata: { path: ["beatId"], equals: beatId } },
            ],
        },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            senderId: true,
            createdAt: true,
            sender: {
                select: {
                    name: true,
                },
            },
        },
    });
    const metadata = {
        taskId,
        beatId,
        updateId,
        notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_CHEER,
    };
    let senderName = cheerer.name.trim() || "Someone";
    let otherCount = 0;
    if (existingNotification) {
        senderName =
            existingNotification.sender?.name.trim() ||
                senderName;
        const groupStart = new Date(existingNotification.createdAt.getTime() - 5000);
        const cheerCountInGroup = await tx.cheer.count({
            where: {
                beatId,
                createdAt: { gte: groupStart },
            },
        });
        otherCount = Math.max(1, cheerCountInGroup - 1);
    }
    const { title, body } = (0, notificationTextCatalog_1.getTaskCheerPushText)(senderName, beatType, otherCount);
    if (existingNotification) {
        await tx.notification.update({
            where: { id: existingNotification.id },
            data: {
                message: body,
                read: false,
                metadata,
            },
        });
        return null;
    }
    else {
        await tx.notification.create({
            data: {
                userId: ownerId,
                senderId: cheererId,
                type: notificationTypes_1.NOTIFICATION_TYPES.TASK_CHEER,
                taskType,
                message: body,
                metadata,
            },
        });
    }
    if (!owner?.fcmToken)
        return null;
    return {
        token: owner.fcmToken,
        title,
        body,
        data: {
            taskId,
            beatId,
            notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_CHEER,
            ...(updateId ? { updateId } : {}),
            deeplinkPath: `/tasks/${taskId}`,
            screen: "TaskDetail",
        },
    };
}
async function cheerBeat({ beatId, userId, presetKey, }) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await client_2.prisma.$transaction(async (tx) => {
                const beat = await tx.taskBeat.findUnique({
                    where: { id: beatId },
                    select: {
                        id: true,
                        taskId: true,
                        type: true,
                        updateId: true,
                    },
                });
                if (!beat) {
                    throw new AppError_1.AppError("Beat not found.", httpStatus_1.HttpStatus.NOT_FOUND);
                }
                const lockedTasks = await tx.$queryRaw `
            SELECT id, "userId", type, completed
            FROM "Task"
            WHERE id = ${beat.taskId}
            FOR UPDATE
          `;
                const task = lockedTasks[0];
                if (!task) {
                    throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
                }
                if (task.type !== "motivation") {
                    throw new AppError_1.AppError("Cheers are only available for motivation tasks.", httpStatus_1.HttpStatus.BAD_REQUEST);
                }
                if (task.completed) {
                    throw new AppError_1.AppError("Completed tasks cannot receive cheers.", httpStatus_1.HttpStatus.CONFLICT);
                }
                if (task.userId === userId) {
                    throw new AppError_1.AppError("You cannot cheer your own task.", httpStatus_1.HttpStatus.FORBIDDEN);
                }
                if (await (0, moderation_service_1.isTaskHiddenForViewer)(task.userId, userId)) {
                    throw new AppError_1.AppError("This task is unavailable.", httpStatus_1.HttpStatus.FORBIDDEN);
                }
                const push = await tx.push.findFirst({
                    where: {
                        taskId: beat.taskId,
                        userId,
                    },
                    select: { id: true },
                });
                if (!push) {
                    throw new AppError_1.AppError("You need to push this task before cheering it.", httpStatus_1.HttpStatus.FORBIDDEN);
                }
                const latestBeat = await tx.taskBeat.findFirst({
                    where: { taskId: beat.taskId },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    select: { id: true },
                });
                if (latestBeat?.id !== beat.id) {
                    throw new AppError_1.AppError("Cheering is only open on the latest beat.", httpStatus_1.HttpStatus.CONFLICT);
                }
                const preset = (0, cheer_presets_1.getActiveCheerPreset)(presetKey);
                if (!preset) {
                    throw new AppError_1.AppError("Invalid cheer preset.", httpStatus_1.HttpStatus.BAD_REQUEST);
                }
                let inserted = false;
                try {
                    await tx.cheer.create({
                        data: {
                            taskId: beat.taskId,
                            beatId: beat.id,
                            userId,
                            presetKey: preset.key,
                            presetTextSnapshot: preset.text,
                        },
                        select: { id: true },
                    });
                    inserted = true;
                }
                catch (error) {
                    if (!isKnownPrismaError(error, "P2002")) {
                        throw error;
                    }
                }
                const pushNotification = inserted
                    ? await createOrUpdateCheerNotification(tx, {
                        taskId: beat.taskId,
                        taskType: task.type,
                        beatId: beat.id,
                        updateId: beat.updateId,
                        beatType: beat.type,
                        ownerId: task.userId,
                        cheererId: userId,
                    })
                    : null;
                const summary = await getTaskCheerSummaryForTask(beat.taskId, userId, tx);
                const beatState = summary.beats.find((item) => item.beatId === beat.id);
                return {
                    response: {
                        beat: beatState,
                        ...summary,
                    },
                    pushNotification,
                };
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
            if (result.pushNotification) {
                (0, scheduleReminderPush_1.schedulePush)(0, result.pushNotification.token, result.pushNotification.title, result.pushNotification.body, result.pushNotification.data);
            }
            return result.response;
        }
        catch (error) {
            lastError = error;
            if (!isKnownPrismaError(error, "P2034")) {
                throw error;
            }
        }
    }
    throw lastError;
}
