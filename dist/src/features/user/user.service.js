"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUserToDB = syncUserToDB;
exports.getMutualFriends = getMutualFriends;
exports.matchUsersByEmail = matchUsersByEmail;
exports.toggleFollowUser = toggleFollowUser;
exports.getFollowers = getFollowers;
exports.getFollowing = getFollowing;
exports.getUserById = getUserById;
exports.getFollowersCount = getFollowersCount;
exports.getFollowingCount = getFollowingCount;
exports.getTaskStatsForUser = getTaskStatsForUser;
exports.searchFriendsService = searchFriendsService;
exports.getUserProfileById = getUserProfileById;
const client_1 = require("../../db/client");
const AppError_1 = require("../../errors/AppError");
const httpStatus_1 = require("../../types/httpStatus");
async function syncUserToDB({ id, email, name, photo, fcmToken, }) {
    return client_1.prisma.user.upsert({
        where: { id },
        update: { name, email, photo, fcmToken },
        create: { id, name, email, photo, fcmToken },
    });
}
async function getMutualFriends(currentUserId, targetUserId) {
    const [currentFollowing, targetFollowing] = await Promise.all([
        client_1.prisma.follow.findMany({
            where: { followerId: currentUserId },
            select: { followingId: true },
        }),
        client_1.prisma.follow.findMany({
            where: { followerId: targetUserId },
            select: { followingId: true },
        }),
    ]);
    const currentSet = new Set(currentFollowing.map((f) => f.followingId));
    const mutualIds = targetFollowing
        .map((f) => f.followingId)
        .filter((id) => currentSet.has(id));
    if (mutualIds.length === 0)
        return [];
    const mutuals = await client_1.prisma.user.findMany({
        where: { id: { in: mutualIds } },
        select: {
            id: true,
            name: true,
            photo: true,
            email: true,
        },
        take: 5,
    });
    return mutuals;
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
    console.log("🧪 toggleFollowUser input:", { followerId, followingId });
    if (followerId === followingId) {
        console.warn("❌ Self-follow attempt");
        throw new AppError_1.AppError("You cannot follow yourself.", 400);
    }
    try {
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
    catch (err) {
        console.error("❌ [toggleFollowUser ERROR]", err);
        throw new AppError_1.AppError("Internal error while toggling follow", 500);
    }
}
async function getFollowers(userId) {
    const followers = await client_1.prisma.follow.findMany({
        where: {
            followingId: userId,
            followerId: { not: userId }, // ✅ Prevents self-follow
        },
        include: {
            follower: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    photo: true,
                },
            },
        },
    });
    const following = await client_1.prisma.follow.findMany({
        where: {
            followerId: userId,
        },
        select: {
            followingId: true,
        },
    });
    const followingIds = new Set(following.map((f) => f.followingId));
    const result = followers
        .filter((f) => f.follower !== null)
        .map((f) => ({
        ...f.follower,
        isFollowing: followingIds.has(f.follower.id),
    }));
    console.log("✅ Filtered followers:", result.map((r) => r.id));
    return result;
}
async function getFollowing(userId) {
    const followings = await client_1.prisma.follow.findMany({
        where: {
            followerId: userId,
            followingId: { not: userId }, // ✅ Avoid self-follow
        },
        include: {
            following: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    photo: true,
                },
            },
        },
    });
    console.log("🔍 Raw followings:", followings);
    const result = followings
        .filter((f) => f.following !== null)
        .map((f) => ({
        ...f.following,
        isFollowing: true,
    }));
    console.log("✅ Filtered following:", result.map((r) => r.id));
    return result;
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
async function searchFriendsService(userId, query, includeFollowed) {
    // Get followed user IDs
    const following = await client_1.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    const followingIdSet = new Set(followingIds);
    // Fetch all matching users except the requester
    const users = await client_1.prisma.user.findMany({
        where: {
            id: { not: userId },
            OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
            ],
        },
        select: {
            id: true,
            name: true,
            email: true,
            photo: true,
        },
        take: 10,
    });
    return users
        .filter((user) => (includeFollowed ? true : !followingIdSet.has(user.id)))
        .map((user) => ({
        ...user,
        isFollowing: followingIdSet.has(user.id),
    }));
}
async function getUserProfileById(targetUserId, currentUserId) {
    const user = await getUserById(targetUserId);
    if (!user) {
        throw new AppError_1.AppError("User not found", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    const [followersCount, followingCount, taskStats, recentTasks, mutualFriends,] = await Promise.all([
        getFollowersCount(targetUserId),
        getFollowingCount(targetUserId),
        getTaskStatsForUser(targetUserId),
        client_1.prisma.task.findMany({
            where: { userId: targetUserId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
                id: true,
                text: true,
                type: true,
                createdAt: true,
                completed: true,
                remindAt: true,
                options: true,
                deliverAt: true,
                helpers: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                    },
                },
            },
        }),
        getMutualFriends(currentUserId, targetUserId), // ✅ added
    ]);
    const [isFollowing, isFollowedBy] = await Promise.all([
        client_1.prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: targetUserId,
                },
            },
        }),
        client_1.prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: targetUserId,
                    followingId: currentUserId,
                },
            },
        }),
    ]);
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        bio: null,
        followersCount,
        followingCount,
        isFollowing: !!isFollowing,
        isFollowedBy: !!isFollowedBy,
        recentTasks,
        mutualFriends, // ✅ added
        taskSuccessRate: taskStats.successRate,
        tasksDone: taskStats.tasksDone,
        dayStreak: taskStats.dayStreak,
    };
}
