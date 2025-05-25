"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUserToDB = syncUserToDB;
exports.matchUsersByEmail = matchUsersByEmail;
exports.toggleFollowUser = toggleFollowUser;
exports.getFollowers = getFollowers;
exports.getFollowing = getFollowing;
exports.getUserById = getUserById;
exports.getFollowersCount = getFollowersCount;
exports.getFollowingCount = getFollowingCount;
exports.getTaskStatsForUser = getTaskStatsForUser;
const client_1 = require("../../db/client");
const AppError_1 = require("../../errors/AppError");
async function syncUserToDB({ id, email, name, photo, fcmToken, }) {
    return client_1.prisma.user.upsert({
        where: { id },
        update: { name, email, photo, fcmToken },
        create: { id, name, email, photo, fcmToken },
    });
}
async function matchUsersByEmail(emails, followerId) {
    const users = await client_1.prisma.user.findMany({
        where: {
            email: { in: emails.map((e) => e.toLowerCase()) },
            id: { not: followerId }, // optional: exclude self
        },
        select: {
            id: true,
            email: true,
            name: true,
            photo: true,
        },
    });
    const followMap = await client_1.prisma.follow.findMany({
        where: {
            followerId,
            followingId: { in: users.map((u) => u.id) },
        },
        select: {
            followingId: true,
        },
    });
    const followedIds = new Set(followMap.map((f) => f.followingId));
    return users.map((user) => ({
        ...user,
        isFollowing: followedIds.has(user.id),
    }));
}
async function toggleFollowUser(followerId, followingId) {
    if (followerId === followingId) {
        throw new AppError_1.AppError("You cannot follow yourself.", 400);
    }
    const existing = await client_1.prisma.follow.findUnique({
        where: {
            followerId_followingId: {
                followerId,
                followingId,
            },
        },
    });
    if (existing) {
        await client_1.prisma.follow.delete({
            where: {
                followerId_followingId: {
                    followerId,
                    followingId,
                },
            },
        });
        return { success: true, action: "unfollowed" };
    }
    await client_1.prisma.follow.create({
        data: {
            followerId,
            followingId,
        },
    });
    const follower = await client_1.prisma.user.findUnique({
        where: { id: followerId },
        select: { name: true, photo: true },
    });
    await client_1.prisma.notification.create({
        data: {
            userId: followingId,
            senderId: followerId,
            type: "follow",
            message: `${follower?.name ?? "Someone"} followed you`,
            metadata: {
                followerId,
                followerName: follower?.name,
                followerPhoto: follower?.photo,
            },
        },
    });
    return { success: true, action: "followed" };
}
async function getFollowers(userId) {
    // Get raw follower connections
    const followers = await client_1.prisma.follow.findMany({
        where: { followingId: userId },
        include: {
            follower: {
                select: { id: true, name: true, email: true, photo: true },
            },
        },
    });
    // Get whom the current user is following
    const following = await client_1.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
    });
    const followingIds = new Set(following.map((f) => f.followingId));
    console.log(followers
        .filter((f) => f.follower !== null)
        .map((f) => ({
        ...f.follower,
        isFollowing: followingIds.has(f.follower.id),
    })));
    return followers
        .filter((f) => f.follower !== null)
        .map((f) => ({
        ...f.follower,
        isFollowing: followingIds.has(f.follower.id),
    }));
}
async function getFollowing(userId) {
    const followings = await client_1.prisma.follow.findMany({
        where: { followerId: userId },
        include: {
            following: {
                select: { id: true, name: true, email: true, photo: true },
            },
        },
    });
    console.log(followings
        .filter((f) => f.following !== null)
        .map((f) => ({
        ...f.following,
        isFollowing: true,
    })));
    return followings
        .filter((f) => f.following !== null)
        .map((f) => ({
        ...f.following,
        isFollowing: true,
    }));
}
async function getUserById(userId) {
    return client_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            photo: true,
            createdAt: true,
        },
    });
}
async function getFollowersCount(userId) {
    return client_1.prisma.follow.count({
        where: { followingId: userId },
    });
}
async function getFollowingCount(userId) {
    return client_1.prisma.follow.count({
        where: { followerId: userId },
    });
}
async function getTaskStatsForUser(userId) {
    const tasks = await client_1.prisma.task.findMany({
        where: { userId },
        select: {
            completed: true,
            completedAt: true, // ✅ THIS LINE IS REQUIRED
        },
    });
    const total = tasks.length;
    const completedTasks = tasks.filter((t) => t.completed).length;
    const successRate = total === 0 ? 0 : Math.round((completedTasks / total) * 100);
    // Collect all unique YYYY-MM-DD dates for completed tasks
    const completedDates = new Set(tasks
        .filter((t) => t.completed && t.completedAt)
        .map((t) => t.completedAt.toISOString().split("T")[0]));
    // Calculate streak: consecutive days ending today
    let streak = 0;
    let currentDate = new Date();
    while (completedDates.has(currentDate.toISOString().split("T")[0])) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    }
    return {
        tasksDone: completedTasks,
        successRate,
        dayStreak: streak,
    };
}
