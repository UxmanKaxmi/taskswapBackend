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
exports.getHomeSummaryForUser = getHomeSummaryForUser;
exports.getUserProfileById = getUserProfileById;
const client_1 = require("../../db/client");
const AppError_1 = require("../../errors/AppError");
const httpStatus_1 = require("../../types/httpStatus");
const task_service_1 = require("../task/task.service");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
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
            username: true,
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
                message: (0, notificationTextCatalog_1.getFollowNotificationMessage)(follower?.name ?? "Someone"),
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
                    username: true,
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
                    username: true,
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
            username: true,
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
            username: true,
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
async function getHomeSummaryForUser(userId, utcOffsetMinutes = 0) {
    // Who the current user follows — the home feed only cares about these people.
    const [following, compactStatus, ownGoal] = await Promise.all([
        client_1.prisma.follow.findMany({
            where: { followerId: userId },
            select: { followingId: true },
        }),
        getHomeCompactStatusForUser(userId, utcOffsetMinutes),
        // The user's own most recent active goal — authoritative source for the
        // "Your goal" card (decoupled from the shared "needs a push" feed).
        client_1.prisma.task.findFirst({
            where: { userId, type: "motivation", completed: false, completedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                text: true,
                pushCount: true,
                createdAt: true,
                _count: { select: { progressUpdates: true } },
            },
        }),
    ]);
    const followingIds = following.map((f) => f.followingId);
    const yourGoal = ownGoal
        ? {
            taskId: ownGoal.id,
            text: ownGoal.text,
            pushCount: ownGoal.pushCount,
            createdAt: ownGoal.createdAt.toISOString(),
            progressCount: ownGoal._count.progressUpdates,
        }
        : null;
    // No one followed yet → empty but valid summary.
    if (followingIds.length === 0) {
        return {
            yourGoal,
            summaryCounts: { peopleNeedYourPushToday: 0, replyWaitingCount: 0 },
            compactStatus,
            modules: null,
            successStory: null,
            heroModule: null,
            peopleNeedYourPushToday: 0,
            replyWaitingCount: 0,
            featuredStory: null,
        };
    }
    const [pushableTasks, pushedCompleted] = await Promise.all([
        // Active motivation tasks from followed users the current user hasn't pushed yet.
        client_1.prisma.task.findMany({
            where: {
                userId: { in: followingIds },
                completed: false,
                isPublic: true,
                type: "motivation",
                Push: { none: { userId } },
            },
            select: { userId: true },
        }),
        // Most recent completed motivation task the current user pushed → success story.
        client_1.prisma.task.findFirst({
            where: {
                completed: true,
                completedAt: { not: null },
                userId: { in: followingIds },
                type: "motivation",
                Push: { some: { userId } },
            },
            orderBy: { completedAt: "desc" },
            include: {
                user: { select: { id: true, name: true, photo: true } },
                Push: { where: { userId }, select: { createdAt: true }, take: 1 },
            },
        }),
    ]);
    const peopleNeedYourPushToday = new Set(pushableTasks.map((t) => t.userId)).size;
    // Reply/advice/decision mechanics are deprecated (motivation-only product).
    // Field kept for the mobile contract; always 0 now.
    const replyWaitingCount = 0;
    let successStory = null;
    let featuredStory = null;
    if (pushedCompleted && pushedCompleted.completedAt) {
        const owner = pushedCompleted.user;
        const pushedAt = pushedCompleted.Push[0]?.createdAt ?? null;
        const entity = {
            type: "task",
            taskId: pushedCompleted.id,
            taskText: pushedCompleted.text,
            ownerId: owner.id,
            ownerName: owner.name,
            ownerPhoto: owner.photo ?? null,
        };
        successStory = {
            type: "success_story",
            title: `${owner.name} pulled it off`,
            body: `Your push helped ${owner.name} finish their task.`,
            entity,
            timestamps: {
                contributedAt: (pushedAt ?? pushedCompleted.completedAt).toISOString(),
                resultAt: pushedCompleted.completedAt.toISOString(),
            },
        };
        featuredStory = {
            type: "motivation-success",
            taskId: pushedCompleted.id,
            taskText: pushedCompleted.text,
            ownerId: owner.id,
            ownerName: owner.name,
            ownerPhoto: owner.photo ?? null,
            pushedAt: pushedAt ? pushedAt.toISOString() : null,
            completedAt: pushedCompleted.completedAt.toISOString(),
        };
    }
    return {
        yourGoal,
        summaryCounts: { peopleNeedYourPushToday, replyWaitingCount },
        compactStatus,
        modules: successStory ? { successStory } : null,
        successStory,
        heroModule: successStory,
        peopleNeedYourPushToday,
        replyWaitingCount,
        featuredStory,
    };
}
async function getHomeCompactStatusForUser(userId, utcOffsetMinutes) {
    const now = new Date();
    const todayRange = getUtcRangeForLocalDate(now, utcOffsetMinutes);
    const since = new Date(todayRange.start.getTime() - 370 * 24 * 60 * 60 * 1000);
    const [pushedTodayCount, recentPushes] = await Promise.all([
        client_1.prisma.push.count({
            where: {
                userId,
                createdAt: {
                    gte: todayRange.start,
                    lt: todayRange.end,
                },
                task: {
                    type: "motivation",
                    userId: { not: userId },
                },
            },
        }),
        client_1.prisma.push.findMany({
            where: {
                userId,
                createdAt: { gte: since },
                task: {
                    type: "motivation",
                    userId: { not: userId },
                },
            },
            select: { createdAt: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);
    const pushDayKeys = new Set(recentPushes.map((push) => getLocalDateKey(push.createdAt, utcOffsetMinutes)));
    const todayKey = getLocalDateKey(now, utcOffsetMinutes);
    if (!pushDayKeys.has(todayKey)) {
        return { streakDay: 0, pushedTodayCount: 0 };
    }
    const localCursor = getLocalDateParts(now, utcOffsetMinutes);
    const cursorDate = new Date(Date.UTC(localCursor.year, localCursor.month, localCursor.day));
    let streakDay = 0;
    while (pushDayKeys.has(toDateKey(cursorDate))) {
        streakDay += 1;
        cursorDate.setUTCDate(cursorDate.getUTCDate() - 1);
    }
    return { streakDay, pushedTodayCount };
}
function getUtcRangeForLocalDate(date, utcOffsetMinutes) {
    const parts = getLocalDateParts(date, utcOffsetMinutes);
    const start = new Date(Date.UTC(parts.year, parts.month, parts.day) -
        utcOffsetMinutes * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
}
function getLocalDateKey(date, utcOffsetMinutes) {
    const parts = getLocalDateParts(date, utcOffsetMinutes);
    return [
        String(parts.year).padStart(4, "0"),
        String(parts.month + 1).padStart(2, "0"),
        String(parts.day).padStart(2, "0"),
    ].join("-");
}
function getLocalDateParts(date, utcOffsetMinutes) {
    const shifted = new Date(date.getTime() + utcOffsetMinutes * 60 * 1000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
    };
}
function toDateKey(date) {
    return [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}
async function getUserProfileById(targetUserId, currentUserId) {
    const user = await getUserById(targetUserId);
    if (!user)
        throw new AppError_1.AppError("User not found", httpStatus_1.HttpStatus.NOT_FOUND);
    const [followersCount, followingCount, taskStats, recentTasks, mutualFriends,] = await Promise.all([
        getFollowersCount(targetUserId),
        getFollowingCount(targetUserId),
        getTaskStatsForUser(targetUserId),
        (0, task_service_1.getRecentTasksForUserProfile)(targetUserId, currentUserId, 5),
        currentUserId ? getMutualFriends(currentUserId, targetUserId) : [],
    ]);
    let isFollowing = false;
    let isFollowedBy = false;
    if (currentUserId) {
        const [followData1, followData2] = await Promise.all([
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
        isFollowing = !!followData1;
        isFollowedBy = !!followData2;
    }
    return {
        id: user.id,
        name: user.name,
        username: user.username,
        photo: user.photo,
        bio: null,
        followersCount,
        followingCount,
        isFollowing,
        isFollowedBy,
        recentTasks,
        mutualFriends,
        taskSuccessRate: taskStats.successRate,
        tasksDone: taskStats.tasksDone,
        dayStreak: taskStats.dayStreak,
    };
}
