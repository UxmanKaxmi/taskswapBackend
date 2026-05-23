"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.shareTaskProgress = shareTaskProgress;
exports.getTaskById = getTaskById;
exports.getAllTasks = getAllTasks;
exports.getRecentTasksForUserProfile = getRecentTasksForUserProfile;
exports.deleteTask = deleteTask;
exports.markTaskAsDone = markTaskAsDone;
exports.markTaskAsNotDone = markTaskAsNotDone;
exports.getTaskViewCount = getTaskViewCount;
exports.increaseTaskViewCount = increaseTaskViewCount;
const AppError_1 = require("../../errors/AppError");
const client_1 = require("../../db/client");
const httpStatus_1 = require("../../types/httpStatus");
const notificationTypes_1 = require("../../types/notificationTypes");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const notification_service_1 = require("../notification/notification.service");
const seededPush_service_1 = require("../seededPush/seededPush.service");
const user_serializers_1 = require("../user/user.serializers");
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
/* -------------------------------------------------------
   INTERNAL UTILS
--------------------------------------------------------- */
function validateDecisionOptions(options) {
    if (!options || options.length < 2) {
        throw new AppError_1.AppError("Decision tasks must have at least two options.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    const normalized = options.map((o) => o.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
        throw new AppError_1.AppError("Decision options must be unique.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
}
function toProgressUpdateSummary(progressUpdate) {
    if (!progressUpdate)
        return null;
    return {
        text: progressUpdate.text,
        createdAt: progressUpdate.createdAt.toISOString(),
    };
}
async function checkDuplicateTask(text, userId, excludeId) {
    return client_1.prisma.task.findFirst({
        where: {
            text,
            userId,
            NOT: excludeId ? { id: excludeId } : undefined,
        },
    });
}
function hasHelpers(input) {
    return "helpers" in input && Array.isArray(input.helpers);
}
async function transformTasksForFeed(tasks, userId) {
    const taskIds = tasks.map((t) => t.id);
    const viewerId = userId ?? null;
    if (taskIds.length === 0) {
        return [];
    }
    const remindedTaskIds = new Set();
    if (viewerId) {
        const reminders = await client_1.prisma.reminderNote.findMany({
            where: { senderId: viewerId, taskId: { in: taskIds } },
            select: { taskId: true },
        });
        reminders.forEach((r) => remindedTaskIds.add(r.taskId));
    }
    const advisedTaskIds = new Set();
    if (viewerId) {
        const adviceComments = await client_1.prisma.comment.findMany({
            where: {
                userId: viewerId,
                taskId: { in: taskIds },
                task: { type: "advice" },
            },
            select: { taskId: true },
        });
        adviceComments.forEach((c) => advisedTaskIds.add(c.taskId));
    }
    const allVotes = await client_1.prisma.vote.findMany({
        where: { taskId: { in: taskIds } },
        select: {
            taskId: true,
            option: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    photo: true,
                    avatarInitial: true,
                    avatarColor: true,
                },
            },
        },
    });
    const voteMap = {};
    for (const { taskId, option, user } of allVotes) {
        if (!voteMap[taskId])
            voteMap[taskId] = {};
        if (!voteMap[taskId][option])
            voteMap[taskId][option] = { count: 0, voters: [] };
        voteMap[taskId][option].count++;
        voteMap[taskId][option].voters.push((0, user_serializers_1.toPublicUser)(user));
    }
    const userVoteMap = {};
    if (viewerId) {
        const userVotes = await client_1.prisma.vote.findMany({
            where: { userId: viewerId, taskId: { in: taskIds } },
            select: { taskId: true, option: true },
        });
        userVotes.forEach(({ taskId, option }) => {
            userVoteMap[taskId] = option;
        });
    }
    return tasks.map((task) => {
        const { _count, Push, helpers, ...cleanTask } = task;
        const taskVotes = voteMap[task.id] || {};
        const transformedVotes = Object.fromEntries(Object.entries(taskVotes).map(([opt, v]) => [
            opt,
            { count: v.count, preview: v.voters.slice(0, 4) },
        ]));
        return {
            ...cleanTask,
            helpers: helpers.map(user_serializers_1.toPublicUser),
            commentsCount: task._count.Comment,
            reminderNoteCount: task._count.ReminderNote,
            voteCount: task._count.Vote,
            helpersCount: task._count.helpers,
            pushCount: task.type === "motivation" ? task._count.Push : 0,
            hasPushed: viewerId && task.type === "motivation" ? (Push?.length ?? 0) > 0 : false,
            hasAdvised: viewerId && task.type === "advice" ? advisedTaskIds.has(task.id) : false,
            hasReminded: viewerId ? remindedTaskIds.has(task.id) : false,
            votes: transformedVotes,
            votedOption: viewerId ? userVoteMap[task.id] ?? null : null,
            hasVoted: viewerId ? Boolean(userVoteMap[task.id]) : false,
        };
    });
}
/* -------------------------------------------------------
   CREATE TASK (auth required)
--------------------------------------------------------- */
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
        throw new AppError_1.AppError("User not found.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    const avatar = input.avatar ?? user.photo ?? undefined;
    const name = user.name;
    const remindAt = type === "reminder" ? input.remindAt : undefined;
    if (type === "decision") {
        validateDecisionOptions(input.options);
    }
    const options = type === "decision"
        ? input.options?.map((o) => o.trim()) ?? []
        : [];
    const deliverAt = type === "motivation" ? input.deliverAt ?? undefined : undefined;
    const helpers = hasHelpers(input) && input.helpers?.length
        ? { connect: input.helpers.map((id) => ({ id })) }
        : undefined;
    const createdTask = await client_1.prisma.task.create({
        data: {
            text,
            type,
            userId,
            avatar,
            name,
            remindAt,
            options,
            deliverAt,
            helpers,
        },
        include: { helpers: true },
    });
    /* ---------------------------
       Schedule reminder push
    ----------------------------- */
    if (type === "reminder" && remindAt && user.fcmToken) {
        const delayMs = new Date(remindAt).getTime() - Date.now();
        if (delayMs > 0) {
            (0, scheduleReminderPush_1.schedulePush)(delayMs, user.fcmToken, "⏰ Reminder", `It's time: "${text}"`, {
                notificationType: notificationTypes_1.NOTIFICATION_TYPES.REMINDER,
                taskId: createdTask.id,
                taskType: type,
                screen: "TaskDetail",
                deeplinkPath: `/tasks/${createdTask.id}`,
            });
        }
    }
    /* ---------------------------
       Notify helpers immediately
    ----------------------------- */
    if (hasHelpers(input) && input.helpers?.length) {
        const helperUsers = await client_1.prisma.user.findMany({
            where: { id: { in: input.helpers }, origin: "real" },
            select: { id: true, fcmToken: true },
        });
        const bodyMap = {
            reminder: `You were asked to help with a reminder: “${text}”`,
            advice: `Someone needs your advice: “${text}”`,
            motivation: `You were asked to motivate someone: “${text}”`,
            decision: `Someone needs your input: “${text}”`,
        };
        await Promise.all(helperUsers.map((helper) => helper.fcmToken
            ? (0, scheduleReminderPush_1.schedulePush)(0, helper.fcmToken, "🤝 Someone asked for your help", bodyMap[type], {
                notificationType: notificationTypes_1.NOTIFICATION_TYPES.TASK_HELPER,
                taskId: createdTask.id,
                taskType: type,
                screen: "TaskDetail",
                deeplinkPath: `/tasks/${createdTask.id}`,
            })
            : undefined));
        await (0, notification_service_1.createTaskHelperNotifications)({
            helperIds: input.helpers,
            senderId: userId,
            taskId: createdTask.id,
            taskText: text,
        });
    }
    if (type === "motivation") {
        await (0, seededPush_service_1.scheduleSeededPushesForTask)(createdTask.id);
    }
    return createdTask;
}
/* -------------------------------------------------------
   UPDATE TASK
--------------------------------------------------------- */
async function updateTask(id, data) {
    const currentTask = await client_1.prisma.task.findUnique({
        where: { id },
        select: { userId: true, type: true },
    });
    if (!currentTask) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (data.text) {
        const duplicate = await checkDuplicateTask(data.text, currentTask.userId, id);
        if (duplicate) {
            throw new AppError_1.AppError("Duplicate task text.", httpStatus_1.HttpStatus.CONFLICT);
        }
    }
    const isHelperType = ["reminder", "motivation", "advice", "decision"].includes(currentTask.type);
    if ((data.type === "decision" || currentTask.type === "decision") &&
        "options" in data) {
        validateDecisionOptions(data.options);
    }
    const dataToUpdate = {
        text: data.text,
        name: data.name,
        type: data.type,
        remindAt: data.type === "reminder" ? data.remindAt : undefined,
        options: data.type === "decision"
            ? data.options?.map((o) => o.trim()) ?? []
            : [],
        deliverAt: data.type === "motivation" ? data.deliverAt : undefined,
        avatar: data.avatar,
        ...(isHelperType && "helpers" in data
            ? { helpers: { set: data.helpers?.map((id) => ({ id })) ?? [] } }
            : {}),
    };
    return client_1.prisma.task.update({
        where: { id },
        data: dataToUpdate,
        include: { helpers: true },
    });
}
/* -------------------------------------------------------
   SHARE PROGRESS UPDATE
--------------------------------------------------------- */
async function shareTaskProgress(taskId, senderId, text) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            type: true,
            text: true,
            name: true,
            Push: {
                select: { userId: true },
            },
            helpers: {
                select: { id: true },
            },
            progressUpdates: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                    createdAt: true,
                },
            },
        },
    });
    if (!task) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.type !== "motivation") {
        throw new AppError_1.AppError("Progress updates are only available for motivation tasks.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    if (task.userId !== senderId) {
        throw new AppError_1.AppError("You can only share progress on your own task.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    const latestProgressUpdate = task.progressUpdates[0];
    if (latestProgressUpdate) {
        const elapsedMs = Date.now() - latestProgressUpdate.createdAt.getTime();
        if (elapsedMs < SIX_HOURS_MS) {
            const remainingHours = Math.ceil((SIX_HOURS_MS - elapsedMs) / (60 * 60 * 1000));
            throw new AppError_1.AppError(`You can only share a progress update every 6 hours. Try again in about ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`, httpStatus_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    const senderName = task.name.trim() || "Someone";
    const recipientIds = [
        ...new Set([...task.Push.map((push) => push.userId), ...task.helpers.map((helper) => helper.id)]),
    ].filter((recipientId) => recipientId !== senderId);
    const progressUpdate = await client_1.prisma.$transaction(async (tx) => {
        const created = await tx.progressUpdate.create({
            data: {
                taskId,
                senderId,
                text,
            },
        });
        return created;
    });
    await (0, notification_service_1.createTaskProgressUpdateNotifications)({
        recipientIds,
        senderId,
        taskId,
        progressUpdateId: progressUpdate.id,
        taskText: task.text,
        progressText: text,
        taskType: task.type,
        senderName,
    });
    return toProgressUpdateSummary(progressUpdate);
}
/* -------------------------------------------------------
   GET SINGLE TASK (optional auth)
--------------------------------------------------------- */
async function getTaskById(taskId, userId) {
    // ---------------------------------
    // 🔥 Increment view count (non-blocking)
    // ---------------------------------
    client_1.prisma.task.update({
        where: { id: taskId },
        data: { viewCount: { increment: 1 } },
    }).catch(() => { }); // prevent any crash from slowing down response
    // ---------------------------------
    // Fetch task with relations
    // ---------------------------------
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        include: {
            helpers: { select: { id: true, name: true, photo: true } },
            progressUpdates: {
                orderBy: { createdAt: "desc" },
                select: {
                    text: true,
                    createdAt: true,
                },
            },
            Vote: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            username: true,
                            photo: true,
                            avatarInitial: true,
                            avatarColor: true,
                        },
                    },
                },
            },
            _count: { select: { Push: true } },
            Push: userId
                ? {
                    orderBy: { createdAt: "desc" },
                    select: {
                        createdAt: true,
                        message: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                photo: true,
                                avatarInitial: true,
                                avatarColor: true,
                            },
                        },
                    },
                }
                : false,
        },
    });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    // ---------------------------------
    // Voting logic
    // ---------------------------------
    const votes = task.Vote.reduce((acc, v) => {
        if (!acc[v.option])
            acc[v.option] = { count: 0, preview: [] };
        acc[v.option].count += 1;
        if (acc[v.option].preview.length < 3) {
            acc[v.option].preview.push((0, user_serializers_1.toPublicUser)(v.user));
        }
        return acc;
    }, {});
    const votedOption = userId
        ? task.Vote.find((v) => v.userId === userId)?.option ?? null
        : null;
    const hasVoted = userId ? votedOption !== null : false;
    const { Vote, progressUpdates, Push, ...taskData } = task;
    const progressUpdateHistory = progressUpdates
        .map((entry) => toProgressUpdateSummary(entry))
        .filter((entry) => entry !== null);
    // ---------------------------------
    // Include viewCount in response
    // ---------------------------------
    let hasAdvised = false;
    if (userId && task.type === "advice") {
        const advice = await client_1.prisma.comment.findFirst({
            where: {
                taskId,
                userId,
            },
            select: { id: true },
        });
        hasAdvised = !!advice;
    }
    let hasReminded = false;
    if (userId) {
        const reminder = await client_1.prisma.reminderNote.findFirst({
            where: {
                taskId,
                senderId: userId,
            },
            select: { id: true },
        });
        hasReminded = !!reminder;
    }
    const pushItems = (Array.isArray(Push) ? Push : []);
    const pushHistory = task.type === "motivation"
        ? pushItems.map((p) => ({
            user: (0, user_serializers_1.toPublicUser)(p.user),
            message: p.message,
            pushedAt: p.createdAt,
        }))
        : [];
    return {
        ...taskData,
        votes,
        votedOption,
        viewCount: task.viewCount, // 👈 ADD THIS
        hasVoted, // 👈 ADD THIS
        pushCount: task.type === "motivation" ? task._count.Push : 0,
        hasPushed: userId && task.type === "motivation"
            ? pushItems.some((push) => push.user.id === userId)
            : false,
        pushHistory, // 👈 ADD THIS
        hasAdvised,
        hasReminded,
        progressUpdates: progressUpdateHistory,
    };
}
/* -------------------------------------------------------
   GET ALL TASKS (optional auth → public feed)
--------------------------------------------------------- */
async function getAllTasks(userId, helpers) {
    /* ---------------------------------------------
       Always show public feed (optional excludeSelf)
    ----------------------------------------------- */
    let where = {};
    if (helpers?.excludeSelf && userId) {
        where = { userId: { not: userId } };
    }
    const requestedLimit = helpers?.limit ?? 20;
    const normalizedLimit = Math.max(1, Math.min(requestedLimit, 50));
    const fetchLimit = normalizedLimit + 1;
    const cursorId = helpers?.cursor?.trim();
    const findArgs = {
        where,
        include: {
            helpers: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    photo: true,
                    avatarInitial: true,
                    avatarColor: true,
                },
            },
            _count: {
                select: {
                    Comment: true,
                    ReminderNote: true,
                    Vote: true,
                    helpers: true,
                    Push: true,
                },
            },
            Push: userId
                ? {
                    where: { userId },
                    select: { id: true },
                }
                : false,
        },
        orderBy: { createdAt: "desc" },
        take: fetchLimit,
    };
    if (cursorId) {
        findArgs.cursor = { id: cursorId };
        findArgs.skip = 1;
    }
    const tasks = await client_1.prisma.task.findMany(findArgs);
    const hasMore = tasks.length === fetchLimit;
    const trimmed = hasMore ? tasks.slice(0, normalizedLimit) : tasks;
    const lastTask = trimmed[trimmed.length - 1];
    const paginatedTasks = await transformTasksForFeed(trimmed, userId);
    return {
        tasks: paginatedTasks,
        hasMore,
        nextCursor: hasMore && lastTask ? lastTask.id : null,
    };
}
async function getRecentTasksForUserProfile(targetUserId, currentUserId, limit = 5) {
    const recentTasks = await client_1.prisma.task.findMany({
        where: { userId: targetUserId, isPublic: true },
        include: {
            helpers: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    photo: true,
                    avatarInitial: true,
                    avatarColor: true,
                },
            },
            _count: { select: { Comment: true, ReminderNote: true, Vote: true, helpers: true, Push: true } },
            Push: currentUserId
                ? {
                    where: { userId: currentUserId },
                    select: { id: true },
                }
                : false,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    return transformTasksForFeed(recentTasks, currentUserId);
}
/* -------------------------------------------------------
   DELETE TASK
--------------------------------------------------------- */
async function deleteTask(id) {
    const existing = await client_1.prisma.task.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    await client_1.prisma.vote.deleteMany({ where: { taskId: id } });
    return client_1.prisma.task.delete({ where: { id } });
}
/* -------------------------------------------------------
   COMPLETE / UNCOMPLETE TASK
--------------------------------------------------------- */
async function markTaskAsDone(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        include: {
            helpers: { select: { id: true } },
            Push: { select: { userId: true } },
        },
    });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    if (task.userId !== userId)
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    const recipientIds = [
        ...new Set([...task.Push.map((push) => push.userId), ...task.helpers.map((helper) => helper.id)]),
    ].filter((recipientId) => recipientId !== userId);
    if (recipientIds.length > 0) {
        await (0, notification_service_1.createTaskCompletedNotifications)({
            recipientIds,
            senderId: userId,
            taskId: task.id,
            taskText: task.text,
            taskType: task.type,
            senderName: task.name.trim() || "Someone",
        });
    }
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { completed: true, completedAt: new Date() },
    });
}
async function markTaskAsNotDone(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({ where: { id: taskId } });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    if (task.userId !== userId)
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { completed: false, completedAt: null },
    });
}
async function getTaskViewCount(taskId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { viewCount: true },
    });
    return task?.viewCount ?? null;
}
async function increaseTaskViewCount(taskId) {
    await client_1.prisma.task.update({
        where: { id: taskId },
        data: { viewCount: { increment: 1 } },
    });
    return true;
}
