"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeedService = getFeedService;
const client_1 = require("../../db/client");
async function transformTasks(tasks, userId) {
    var _a;
    const taskIds = tasks.map(t => t.id);
    // Reminders mapping
    const reminders = userId
        ? await client_1.prisma.reminderNote.findMany({
            where: { senderId: userId },
            select: { taskId: true }
        })
        : [];
    const remindedTaskIds = new Set(reminders.map(r => r.taskId));
    // Votes
    const allVotes = await client_1.prisma.vote.findMany({
        where: { taskId: { in: taskIds } },
        select: {
            taskId: true,
            option: true,
            user: { select: { id: true, name: true, photo: true } }
        }
    });
    const voteMap = {};
    for (const { taskId, option, user } of allVotes) {
        voteMap[taskId] ?? (voteMap[taskId] = {});
        (_a = voteMap[taskId])[option] ?? (_a[option] = { count: 0, voters: [] });
        voteMap[taskId][option].count++;
        voteMap[taskId][option].voters.push({
            ...user,
            photo: user.photo ?? undefined
        });
    }
    // User votedOption
    const userVotes = userId
        ? await client_1.prisma.vote.findMany({
            where: {
                userId,
                taskId: { in: taskIds }
            },
            select: {
                taskId: true,
                option: true
            }
        })
        : [];
    const userVoteMap = {};
    for (const { taskId, option } of userVotes) {
        userVoteMap[taskId] = option;
    }
    // Final Transform
    return tasks.map(task => {
        const taskVotes = voteMap[task.id] || {};
        const transformedVotes = {};
        for (const option in taskVotes) {
            const v = taskVotes[option];
            transformedVotes[option] = {
                count: v.count,
                preview: v.voters.slice(0, 4)
            };
        }
        return {
            ...task,
            helpers: task.helpers,
            hasReminded: userId ? remindedTaskIds.has(task.id) : false,
            votes: transformedVotes,
            votedOption: userVoteMap[task.id] || null
        };
    });
}
async function getFeedService(userId) {
    // 1) Fetch PUBLIC TASKS
    const publicTasks = await client_1.prisma.task.findMany({
        where: { isPublic: true },
        include: {
            helpers: {
                select: { id: true, name: true, photo: true }
            },
        },
        orderBy: { createdAt: "desc" }
    });
    // Guest user → only public feed
    if (!userId) {
        return await transformTasks(publicTasks, null);
    }
    // 2) Fetch following list
    const followings = await client_1.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
    });
    const friendIds = followings.map(f => f.followingId);
    // 3) Fetch FRIEND TASKS
    const friendTasks = await client_1.prisma.task.findMany({
        where: {
            userId: { in: friendIds }
        },
        include: {
            helpers: {
                select: { id: true, name: true, photo: true }
            },
        },
        orderBy: { createdAt: "desc" }
    });
    // 4) Merge feeds
    const merged = [...publicTasks, ...friendTasks];
    // 5) Transform SAME WAY as getAllTasks()
    return await transformTasks(merged, userId);
}
