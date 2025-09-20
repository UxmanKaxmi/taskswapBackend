"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.getTaskById = getTaskById;
exports.getAllTasks = getAllTasks;
exports.deleteTask = deleteTask;
exports.markTaskAsDone = markTaskAsDone;
exports.markTaskAsNotDone = markTaskAsNotDone;
const AppError_1 = require("../../errors/AppError");
const client_1 = require("../../db/client");
const httpStatus_1 = require("../../types/httpStatus");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const notification_service_1 = require("../notification/notification.service");
async function debugCheckTask(id) {
    const task = await client_1.prisma.task.findUnique({
        where: { id },
    });
    console.log("DEBUG Task:", task);
}
debugCheckTask("3a5d5b43-cd05-4e6c-8d55-fa377da0bf3f");
async function checkDuplicateTask(text, userId, excludeId) {
    return client_1.prisma.task.findFirst({
        where: {
            text,
            userId,
            NOT: excludeId ? { id: excludeId } : undefined,
        },
    });
}
/**
 * Type guard to check if task input supports helpers
 */
function hasHelpers(input) {
    return "helpers" in input && Array.isArray(input.helpers);
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
    const options = type === "decision" ? input.options ?? [] : [];
    const deliverAt = type === "motivation"
        ? input.deliverAt ?? undefined
        : undefined;
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
        include: {
            helpers: true,
        },
    });
    // ✅ Schedule push for the task owner (reminders)
    if (type === "reminder" && remindAt) {
        const delayMs = new Date(remindAt).getTime() - Date.now();
        if (delayMs > 0 && user.fcmToken) {
            (0, scheduleReminderPush_1.schedulePush)(delayMs, user.fcmToken, "✅ Reminder Complete", `It’s time to act on your task: “${text}”`);
        }
    }
    // ✅ Notify helpers immediately
    if (hasHelpers(input) && input.helpers?.length) {
        const helperUsers = await client_1.prisma.user.findMany({
            where: { id: { in: input.helpers } },
            select: { id: true, fcmToken: true },
        });
        const title = "🤝 Someone needs your help";
        const bodyMap = {
            reminder: `You’ve been asked to help with a reminder: “${text}”`,
            advice: `Someone needs your advice on: “${text}”`,
            motivation: `You’ve been invited to motivate someone on: “${text}”`,
            decision: `You’ve been asked to help decide: “${text}”`, // ✅ added
        };
        await Promise.all(helperUsers.map((helper) => {
            if (helper.fcmToken) {
                return (0, scheduleReminderPush_1.schedulePush)(0, helper.fcmToken, title, bodyMap[type]);
            }
        }));
    }
    if (hasHelpers(input) && input.helpers?.length) {
        await (0, notification_service_1.createTaskHelperNotifications)({
            helperIds: input.helpers,
            senderId: userId,
            taskId: createdTask.id,
            taskText: text,
        });
    }
    return createdTask;
}
async function updateTask(id, data) {
    const currentTask = await client_1.prisma.task.findUnique({
        where: { id },
        select: { userId: true, type: true }, // 👈 include type to validate helpers
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
    const isHelperType = currentTask.type === "reminder" ||
        currentTask.type === "motivation" ||
        currentTask.type === "advice" ||
        currentTask.type === "decision";
    const dataToUpdate = {
        text: data.text,
        type: data.type,
        name: data.name,
        remindAt: data.type === "reminder" ? data.remindAt ?? undefined : undefined,
        options: data.type === "decision" ? data.options ?? [] : [],
        deliverAt: data.type === "motivation" ? data.deliverAt ?? undefined : undefined,
        avatar: data.avatar ?? undefined,
        ...(isHelperType && "helpers" in data
            ? {
                helpers: {
                    set: data.helpers?.map((id) => ({ id })) ?? [],
                },
            }
            : {}),
    };
    return client_1.prisma.task.update({
        where: { id },
        data: dataToUpdate,
        include: {
            helpers: true,
        },
    });
}
async function getTaskById(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        include: {
            helpers: {
                select: { id: true, name: true, photo: true },
            },
            Vote: {
                include: {
                    user: {
                        // adjust to your actual User model relation name
                        select: { id: true, name: true, photo: true },
                    },
                },
            },
        },
    });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    const votes = task.Vote.reduce((acc, v) => {
        if (!acc[v.option]) {
            acc[v.option] = { count: 0, preview: [] };
        }
        acc[v.option].count += 1;
        if (acc[v.option].preview.length < 3) {
            // limit preview to 3
            acc[v.option].preview.push({
                id: v.user.id,
                name: v.user.name,
                photo: v.user.photo ?? "", // fallback if null
            });
        }
        return acc;
    }, {});
    const votedOption = userId
        ? task.Vote.find((v) => v.userId === userId)?.option
        : null;
    // Remove raw Vote array from response to match Object 1
    const { Vote, ...taskData } = task;
    return {
        ...taskData,
        votes,
        votedOption,
    };
}
async function getAllTasks(userId, helpers) {
    const followings = await client_1.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
    });
    let userIds = followings.map((f) => f.followingId);
    if (!helpers?.excludeSelf) {
        userIds = [userId, ...userIds];
    }
    const tasks = await client_1.prisma.task.findMany({
        where: {
            userId: {
                in: userIds,
            },
        },
        include: {
            helpers: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    photo: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
        take: helpers?.limit,
    });
    const taskIds = tasks.map((t) => t.id);
    const reminders = await client_1.prisma.reminderNote.findMany({
        where: { senderId: userId },
        select: { taskId: true },
    });
    const remindedTaskIds = new Set(reminders.map((r) => r.taskId));
    const allVotes = await client_1.prisma.vote.findMany({
        where: {
            taskId: { in: taskIds },
        },
        select: {
            taskId: true,
            option: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    photo: true,
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
        voteMap[taskId][option].count += 1;
        voteMap[taskId][option].voters.push({
            ...user,
            photo: user.photo ?? undefined,
        });
    }
    const userVotes = await client_1.prisma.vote.findMany({
        where: {
            userId,
            taskId: { in: taskIds },
        },
        select: {
            taskId: true,
            option: true,
        },
    });
    const userVoteMap = {};
    for (const { taskId, option } of userVotes) {
        userVoteMap[taskId] = option;
    }
    return tasks.map((task) => {
        const taskVotes = voteMap[task.id] || {};
        const transformedVotes = {};
        for (const option in taskVotes) {
            const voteData = taskVotes[option];
            transformedVotes[option] = {
                count: voteData.count,
                preview: voteData.voters.slice(0, 4), // Only first 2 voters
            };
        }
        return {
            ...task,
            hasReminded: remindedTaskIds.has(task.id),
            votes: transformedVotes,
            votedOption: userVoteMap[task.id] || null,
            helpers: task.helpers,
        };
    });
}
async function deleteTask(id) {
    const existing = await client_1.prisma.task.findUnique({
        where: { id },
    });
    if (!existing) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    await client_1.prisma.vote.deleteMany({
        where: { taskId: id },
    });
    // ✅ Now safely delete the task
    return client_1.prisma.task.delete({
        where: { id },
    });
}
async function markTaskAsDone(taskId, userId) {
    console.log("[LOOKUP] task ID:", taskId);
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        include: {
            helpers: {
                select: { id: true },
            },
        },
    });
    if (!task) {
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized to mark this task", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    // ✅ Send notification if it's a decision task
    if (task.type === "decision" && task.helpers.length > 0) {
        const helperIds = task.helpers.map((h) => h.id);
        const helpers = await client_1.prisma.user.findMany({
            where: { id: { in: helperIds } },
            select: { fcmToken: true },
        });
        const title = "✅ Decision Finalized";
        const body = `A decision task you helped with has been marked as done. See the result in the app.`;
        await Promise.all(helpers.map((helper) => {
            if (helper.fcmToken) {
                return (0, scheduleReminderPush_1.schedulePush)(0, helper.fcmToken, title, body);
            }
        }));
        // ✅ ADD THIS: update notification tab
        await (0, notification_service_1.createDecisionTaskDoneNotifications)({
            helperIds,
            senderId: userId,
            taskId: task.id,
            taskText: task.text,
        });
    }
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: {
            completed: true,
            completedAt: new Date(),
        },
    });
}
async function markTaskAsNotDone(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
    });
    if (!task) {
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    // if (task.type !== "reminder") {
    //   throw new AppError(
    //     "Only reminder tasks can be marked as done",
    //     HttpStatus.BAD_REQUEST
    //   );
    // }
    if (task.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized to mark this task", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: {
            completed: false,
            completedAt: null,
        },
    });
}
