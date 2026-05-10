import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { getRecentTasksForUserProfile } from "../task/task.service";
import { HomeModules } from "./user.types";

type ModuleTask = {
  id: string;
  text: string;
  type: "reminder" | "advice" | "decision" | "motivation";
  userId: string;
  name: string;
  avatar: string;
  createdAt: Date;
  completedAt: Date | null;
  Push?: {
    createdAt: Date;
    userId: string;
  }[];
  helpers?: {
    id: string;
    name: string;
    photo: string | null;
  }[];
};

function toPhoto(photo: string | null | undefined) {
  return photo && photo.trim() ? photo : null;
}

function buildEntity(task: ModuleTask) {
  return {
    type: "task" as const,
    taskId: task.id,
    taskType: task.type,
    taskText: task.text,
    ownerId: task.userId,
    ownerName: task.name,
    ownerPhoto: toPhoto(task.avatar),
  };
}

function buildSuccessStoryModule(
  task: ModuleTask,
  contributedAt: Date,
  resultAt: Date
) {
  return {
    id: `success_story:${task.id}`,
    type: "success_story" as const,
    title: "Success story",
    body: `${task.name} finished this goal after your push.`,
    ctaLabel: "View update",
    entity: buildEntity(task),
    timestamps: {
      contributedAt: contributedAt.toISOString(),
      resultAt: resultAt.toISOString(),
    },
  };
}

function buildNeedsYourPushModule(task: ModuleTask) {
  return {
    id: `needs_your_push:${task.id}`,
    type: "needs_your_push" as const,
    title: "Needs your push",
    body: `${task.name} needs a push right now.`,
    ctaLabel: "Send push",
    entity: buildEntity(task),
    stats: {
      pushCount: (task.Push ?? []).length,
    },
  };
}

function buildUpdateProgressModule(
  task: ModuleTask,
  pushCount: number,
  lastPushAt: Date | null
) {
  return {
    id: `update_progress:${task.id}`,
    type: "update_progress" as const,
    title: "Update your progress",
    body: `${pushCount} friend${pushCount === 1 ? "" : "s"} pushed you.`,
    ctaLabel: "Update progress",
    entity: buildEntity(task),
    stats: {
      pushCount,
      lastPushAt: lastPushAt ? lastPushAt.toISOString() : null,
    },
  };
}

function buildAdviceRequestModule(
  task: ModuleTask,
  helperCount: number,
  lastHelperAt: Date | null
) {
  return {
    id: `advice_request:${task.id}`,
    type: "advice_request_waiting_on_you" as const,
    title: "Advice request waiting on you",
    body: `${task.name} needs your advice.`,
    ctaLabel: "Give advice",
    entity: buildEntity(task),
    stats: {
      helperCount,
      lastHelperAt: lastHelperAt ? lastHelperAt.toISOString() : null,
    },
    question: task.text,
  };
}

export async function getHomeSummaryForUser(userId: string): Promise<{
  modules: HomeModules;
}> {
  const [user, followingRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
  ]);

  if (!user) {
    throw new AppError("User not found", HttpStatus.NOT_FOUND);
  }

  const followedUserIds = followingRows.map((row) => row.followingId);

  const [successStoryTasks, followedMotivationTasks, ownMotivationTasks, adviceTasks] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          type: "motivation",
          completed: true,
          completedAt: { not: null },
          userId: { not: userId },
          Push: {
            some: { userId },
          },
        },
        orderBy: { completedAt: "desc" },
        take: 25,
        select: {
          id: true,
          text: true,
          type: true,
          userId: true,
          name: true,
          avatar: true,
          createdAt: true,
          completedAt: true,
          Push: {
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true, userId: true },
          },
        },
      }),
      followedUserIds.length
        ? prisma.task.findMany({
            where: {
              type: "motivation",
              completed: false,
              userId: { in: followedUserIds },
            },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: {
              id: true,
              text: true,
              type: true,
              userId: true,
              name: true,
              avatar: true,
              createdAt: true,
              completedAt: true,
              Push: {
                where: { userId },
                select: { createdAt: true, userId: true },
              },
            },
          })
        : Promise.resolve([] as ModuleTask[]),
      prisma.task.findMany({
        where: {
          type: "motivation",
          completed: false,
          userId,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          text: true,
          type: true,
          userId: true,
          name: true,
          avatar: true,
          createdAt: true,
          completedAt: true,
          Push: {
            orderBy: { createdAt: "desc" },
            select: { createdAt: true, userId: true },
          },
        },
      }),
      prisma.task.findMany({
        where: {
          type: "advice",
          completed: false,
          helpers: {
            some: { id: userId },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          text: true,
          type: true,
          userId: true,
          name: true,
          avatar: true,
          createdAt: true,
          completedAt: true,
          helpers: {
            select: {
              id: true,
              name: true,
              photo: true,
            },
          },
        },
      }),
    ]);

  const successStoryTask = successStoryTasks.find((task) => {
    const pushedAt = task.Push?.[0]?.createdAt;
    return !!task.completedAt && !!pushedAt && pushedAt <= task.completedAt;
  });

  const needsYourPushTask = followedMotivationTasks.find((task) => (task.Push ?? []).length === 0);

  const updateProgressTask = ownMotivationTasks
    .map((task) => {
      const otherPushes = (task.Push ?? []).filter((push) => push.userId !== userId);
      return {
        task,
        otherPushes,
        pushCount: otherPushes.length,
        lastPushAt: otherPushes[0]?.createdAt ?? null,
      };
    })
    .filter((item) => item.pushCount > 0)
    .sort((a, b) => {
      if (b.pushCount !== a.pushCount) return b.pushCount - a.pushCount;
      return (b.lastPushAt?.getTime() ?? 0) - (a.lastPushAt?.getTime() ?? 0);
    })[0];

  const advisedComments = adviceTasks.length
    ? await prisma.comment.findMany({
        where: {
          userId,
          taskId: {
            in: adviceTasks.map((task) => task.id),
          },
        },
        select: { taskId: true },
      })
    : [];

  const advisedTaskIds = new Set(advisedComments.map((comment) => comment.taskId));

  const adviceRequestTask = adviceTasks
    .filter((task) => !advisedTaskIds.has(task.id))
    .map((task) => ({
      task,
      helperCount: task.helpers?.length ?? 0,
      lastHelperAt: task.createdAt,
    }))[0];

  const successStoryPush = successStoryTask?.Push?.[0] ?? null;

  return {
    modules: {
      successStory:
        successStoryTask && successStoryTask.completedAt && successStoryPush
          ? buildSuccessStoryModule(
              successStoryTask,
              successStoryPush.createdAt,
              successStoryTask.completedAt
            )
          : null,
      needsYourPush: needsYourPushTask ? buildNeedsYourPushModule(needsYourPushTask) : null,
      updateProgress: updateProgressTask
        ? buildUpdateProgressModule(
            updateProgressTask.task,
            updateProgressTask.pushCount,
            updateProgressTask.lastPushAt
          )
        : null,
      adviceRequestWaitingOnYou: adviceRequestTask
        ? buildAdviceRequestModule(
            adviceRequestTask.task,
            adviceRequestTask.helperCount,
            adviceRequestTask.lastHelperAt
          )
        : null,
    },
  };
}

export async function syncUserToDB({
  id,
  email,
  name,
  photo,
  fcmToken,
}: {
  id: string;
  email: string;
  name: string;
  photo?: string;
  fcmToken?: string;
}) {
  return prisma.user.upsert({
    where: { id },
    update: { name, email, photo, fcmToken },
    create: { id, name, email, photo, fcmToken },
  });
}

export async function getMutualFriends(
  currentUserId: string,
  targetUserId: string
) {
  const [currentFollowing, targetFollowing] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: currentUserId },
      select: { followingId: true },
    }),
    prisma.follow.findMany({
      where: { followerId: targetUserId },
      select: { followingId: true },
    }),
  ]);

  const currentSet = new Set(currentFollowing.map((f) => f.followingId));
  const mutualIds = targetFollowing
    .map((f) => f.followingId)
    .filter((id) => currentSet.has(id));

  if (mutualIds.length === 0) return [];

  const mutuals = await prisma.user.findMany({
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

export async function matchUsersByEmail(emails: string[], followerId: string) {
  const users = await prisma.user.findMany({
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

  const followMap = await prisma.follow.findMany({
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

export async function toggleFollowUser(
  followerId: string,
  followingId: string
) {
  console.log("🧪 toggleFollowUser input:", { followerId, followingId });

  if (followerId === followingId) {
    console.warn("❌ Self-follow attempt");
    throw new AppError("You cannot follow yourself.", 400);
  }

  try {
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });
      return { success: true, action: "unfollowed" };
    }

    await prisma.follow.create({
      data: {
        followerId,
        followingId,
      },
    });

    const follower = await prisma.user.findUnique({
      where: { id: followerId },
      select: { name: true, photo: true },
    });

    await prisma.notification.create({
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
  } catch (err) {
    console.error("❌ [toggleFollowUser ERROR]", err);
    throw new AppError("Internal error while toggling follow", 500);
  }
}

export async function getFollowers(userId: string) {
  const followers = await prisma.follow.findMany({
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

  const following = await prisma.follow.findMany({
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

  console.log(
    "✅ Filtered followers:",
    result.map((r) => r.id)
  );

  return result;
}
export async function getFollowing(userId: string) {
  const followings = await prisma.follow.findMany({
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

  console.log(
    "✅ Filtered following:",
    result.map((r) => r.id)
  );

  return result;
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
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

export async function getFollowersCount(userId: string) {
  return prisma.follow.count({
    where: { followingId: userId },
  });
}

export async function getFollowingCount(userId: string) {
  return prisma.follow.count({
    where: { followerId: userId },
  });
}

export async function getTaskStatsForUser(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId },
    select: {
      completed: true,
      completedAt: true, // ✅ THIS LINE IS REQUIRED
    },
  });

  const total = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const successRate =
    total === 0 ? 0 : Math.round((completedTasks / total) * 100);

  // Collect all unique YYYY-MM-DD dates for completed tasks
  const completedDates = new Set(
    tasks
      .filter((t) => t.completed && t.completedAt)
      .map((t) => t.completedAt!.toISOString().split("T")[0])
  );

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

export async function searchFriendsService(
  userId: string,
  query: string,
  includeFollowed: boolean
) {
  // Get followed user IDs
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  const followingIds = following.map((f) => f.followingId);
  const followingIdSet = new Set(followingIds);

  // Fetch all matching users except the requester
  const users = await prisma.user.findMany({
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

export async function getUserProfileById(
  targetUserId: string,
  currentUserId: string | null
) {
  const user = await getUserById(targetUserId);

  if (!user) throw new AppError("User not found", HttpStatus.NOT_FOUND);

  const [
    followersCount,
    followingCount,
    taskStats,
    recentTasks,
    mutualFriends,
  ] = await Promise.all([
    getFollowersCount(targetUserId),
    getFollowingCount(targetUserId),
    getTaskStatsForUser(targetUserId),
    getRecentTasksForUserProfile(targetUserId, currentUserId, 5),
    currentUserId ? getMutualFriends(currentUserId, targetUserId) : [],
  ]);

  let isFollowing = false;
  let isFollowedBy = false;

  if (currentUserId) {
    const [followData1, followData2] = await Promise.all([
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      }),
      prisma.follow.findUnique({
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
    email: user.email,
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
