"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.updateTask = updateTask;
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
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const notification_service_1 = require("../notification/notification.service");
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
            user: { select: { id: true, name: true, photo: true } },
        },
    });
    const voteMap = {};
    for (const { taskId, option, user } of allVotes) {
        if (!voteMap[taskId])
            voteMap[taskId] = {};
        if (!voteMap[taskId][option])
            voteMap[taskId][option] = { count: 0, voters: [] };
        voteMap[taskId][option].count++;
        voteMap[taskId][option].voters.push({ ...user, photo: user.photo ?? undefined });
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
        const { _count, ...cleanTask } = task;
        const taskVotes = voteMap[task.id] || {};
        const transformedVotes = Object.fromEntries(Object.entries(taskVotes).map(([opt, v]) => [
            opt,
            { count: v.count, preview: v.voters.slice(0, 4) },
        ]));
        return {
            ...cleanTask,
            commentsCount: task._count.Comment,
            reminderNoteCount: task._count.ReminderNote,
            voteCount: task._count.Vote,
            helpersCount: task._count.helpers,
            pushCount: task.type === "motivation" ? task._count.Push : 0,
            hasPushed: viewerId && task.type === "motivation" ? (task.Push?.length ?? 0) > 0 : false,
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
            (0, scheduleReminderPush_1.schedulePush)(delayMs, user.fcmToken, "⏰ Reminder", `It's time: "${text}"`);
        }
    }
    /* ---------------------------
       Notify helpers immediately
    ----------------------------- */
    if (hasHelpers(input) && input.helpers?.length) {
        const helperUsers = await client_1.prisma.user.findMany({
            where: { id: { in: input.helpers } },
            select: { id: true, fcmToken: true },
        });
        const bodyMap = {
            reminder: `You were asked to help with a reminder: “${text}”`,
            advice: `Someone needs your advice: “${text}”`,
            motivation: `You were asked to motivate someone: “${text}”`,
            decision: `Someone needs your input: “${text}”`,
        };
        await Promise.all(helperUsers.map((helper) => helper.fcmToken
            ? (0, scheduleReminderPush_1.schedulePush)(0, helper.fcmToken, "🤝 Someone asked for your help", bodyMap[type])
            : undefined));
        await (0, notification_service_1.createTaskHelperNotifications)({
            helperIds: input.helpers,
            senderId: userId,
            taskId: createdTask.id,
            taskText: text,
        });
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
            Vote: {
                include: {
                    user: { select: { id: true, name: true, photo: true } },
                },
            },
            _count: { select: { Push: true } },
            Push: userId
                ? {
                    orderBy: { createdAt: "desc" },
                    select: {
                        createdAt: true,
                        user: {
                            select: { id: true, name: true, photo: true },
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
            acc[v.option].preview.push({
                id: v.user.id,
                name: v.user.name,
                photo: v.user.photo ?? "",
            });
        }
        return acc;
    }, {});
    const votedOption = userId
        ? task.Vote.find((v) => v.userId === userId)?.option ?? null
        : null;
    const hasVoted = userId ? votedOption !== null : false;
    const { Vote, ...taskData } = task;
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
    const pushItems = Array.isArray(task.Push)
        ? task.Push
        : [];
    const pushHistory = task.type === "motivation"
        ? pushItems.map((p) => ({
            user: p.user,
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
        hasPushed: userId && task.type === "motivation" ? pushItems.length > 0 : false,
        pushHistory, // 👈 ADD THIS
        hasAdvised,
        hasReminded,
    };
}
/* -------------------------------------------------------
   GET ALL TASKS (optional auth → public feed)
--------------------------------------------------------- */
async function getAllTasks(userId, helpers) {
    /* ---------------------------------------------
       If logged in → show "following" feed
       If logged out → show ALL public posts
    ----------------------------------------------- */
    let taskFilterUserIds;
    if (userId) {
        const followings = await client_1.prisma.follow.findMany({
            where: { followerId: userId },
            select: { followingId: true },
        });
        taskFilterUserIds = followings.map((f) => f.followingId);
        if (!helpers?.excludeSelf)
            taskFilterUserIds = [userId, ...taskFilterUserIds];
    }
    const tasks = await client_1.prisma.task.findMany({
        where: userId ? { userId: { in: taskFilterUserIds } } : {},
        include: {
            helpers: { select: { id: true, name: true, email: true, photo: true } },
            _count: { select: { Comment: true, ReminderNote: true, Vote: true, helpers: true, Push: true } },
            Push: userId
                ? {
                    where: { userId },
                    select: { id: true },
                }
                : false,
        },
        orderBy: { createdAt: "desc" },
        take: helpers?.limit,
    });
    return transformTasksForFeed(tasks, userId);
}
async function getRecentTasksForUserProfile(targetUserId, currentUserId, limit = 5) {
    const recentTasks = await client_1.prisma.task.findMany({
        where: { userId: targetUserId },
        include: {
            helpers: { select: { id: true, name: true, email: true, photo: true } },
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
        include: { helpers: { select: { id: true } } },
    });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    if (task.userId !== userId)
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    if (task.type === "decision" && task.helpers.length > 0) {
        const helperIds = task.helpers.map((h) => h.id);
        const helpers = await client_1.prisma.user.findMany({
            where: { id: { in: helperIds } },
            select: { fcmToken: true },
        });
        await Promise.all(helpers.map((h) => h.fcmToken
            ? (0, scheduleReminderPush_1.schedulePush)(0, h.fcmToken, "✅ Decision Finalized", `A decision you helped with is complete.`)
            : undefined));
        await (0, notification_service_1.createDecisionTaskDoneNotifications)({
            helperIds,
            senderId: userId,
            taskId: task.id,
            taskText: task.text,
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
