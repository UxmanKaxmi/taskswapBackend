import { User } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { getRecentTasksForUserProfile } from "../task/task.service";
import {
  getFollowNotificationMessage,
  getFollowPushText,
} from "../../utils/notificationTextCatalog";
import { sendPushNotification } from "../../utils/sendPushNotification";
import { USER_ORIGIN } from "../seededUser/seededUser.service";
import {
  exchangeAppleAuthorizationCode,
  revokeAppleRefreshToken,
} from "./appleAuth.service";
import { getBlockedUserIdsForViewer } from "../moderation/moderation.service";
import { evaluateCircleLifecycle } from "../circle/circle.service";
import { toPublicUser, PublicUserRecord } from "./user.serializers";

export async function syncUserToDB({
  id,
  email,
  name,
  photo,
  fcmToken,
  provider,
  providerUserId,
  authorizationCode,
}: {
  id: string;
  email?: string;
  name?: string;
  photo?: string;
  fcmToken?: string;
  provider?: string;
  providerUserId?: string;
  authorizationCode?: string;
}) {
  const appleRefreshToken =
    provider === "apple"
      ? await getAppleRefreshTokenFromAuthorizationCode(authorizationCode)
      : undefined;
  const normalizedEmail = normalizeEmail(email);

  const existing = await findExistingUserForVerifiedIdentity({
    id,
    email: normalizedEmail,
    provider,
    providerUserId,
  });

  const updateData = removeUndefined({
    email: normalizedEmail,
    name: getNonEmptyString(name),
    photo,
    fcmToken,
    provider,
    providerUserId,
    appleRefreshToken,
    appleRefreshTokenUpdatedAt: appleRefreshToken ? new Date() : undefined,
  });

  if (existing) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: existing.id },
        data: updateData,
      });

      if (provider && providerUserId) {
        await tx.authAccount.upsert({
          where: { provider_providerUserId: { provider, providerUserId } },
          update: removeUndefined({
            userId: user.id,
            appleRefreshToken,
            appleRefreshTokenUpdatedAt: appleRefreshToken ? new Date() : undefined,
          }),
          create: {
            provider,
            providerUserId,
            userId: user.id,
            appleRefreshToken,
            appleRefreshTokenUpdatedAt: appleRefreshToken ? new Date() : undefined,
          },
        });
      }

      return user;
    });
  }

  const createEmail = normalizedEmail;
  const createName = getNonEmptyString(name);

  if (!createEmail || !createName) {
    throw new AppError(
      "Verified email and name are required for new users",
      HttpStatus.BAD_REQUEST
    );
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id,
        email: createEmail,
        name: createName,
        photo,
        fcmToken,
        provider,
        providerUserId,
        appleRefreshToken,
        appleRefreshTokenUpdatedAt: appleRefreshToken ? new Date() : undefined,
      },
    });

    if (provider && providerUserId) {
      await tx.authAccount.create({
        data: {
          provider,
          providerUserId,
          userId: user.id,
          appleRefreshToken,
          appleRefreshTokenUpdatedAt: appleRefreshToken ? new Date() : undefined,
        },
      });
    }

    return user;
  });
}

// Lightweight token refresh used by the app whenever FCM rotates the token.
// Authenticated with the backend JWT, so it works for every auth provider.
export async function updateFcmToken(userId: string, fcmToken: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
    select: { id: true },
  });
}

async function findExistingUserForVerifiedIdentity({
  id,
  email,
  provider,
  providerUserId,
}: {
  id: string;
  email?: string;
  provider?: string;
  providerUserId?: string;
}) {
  if (provider && providerUserId) {
    const authAccount = await prisma.authAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true },
    });

    if (authAccount) return authAccount.user;

    const legacyProviderUser = await prisma.user.findFirst({
      where: { provider, providerUserId },
    });

    if (legacyProviderUser) return legacyProviderUser;
  }

  const sameIdUser = await prisma.user.findUnique({ where: { id } });
  if (sameIdUser) return sameIdUser;

  if (email) {
    return prisma.user.findUnique({ where: { email } });
  }

  return null;
}

async function getAppleRefreshTokenFromAuthorizationCode(
  authorizationCode?: string
): Promise<string | undefined> {
  try {
    return await exchangeAppleAuthorizationCode(authorizationCode);
  } catch (error) {
    console.error("[APPLE_AUTH] Failed to exchange authorization code", error);
    return undefined;
  }
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeEmail(value: unknown): string | undefined {
  return getNonEmptyString(value)?.toLowerCase();
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

/**
 * Permanently delete a user and all of their owned content.
 *
 * The Task.user relation has no onDelete rule (defaults to Restrict), so a
 * user's own tasks must be removed before the user row. Deleting the tasks
 * cascades to task-scoped rows (beats, cheers, votes, comments, pushes,
 * progress updates, reminder notes); deleting the user cascades the rest
 * (follows, notifications, that user's cheers/pushes/votes/comments on other
 * tasks, referral codes/links). Feedback and received referrals are set null
 * per the schema so other users' non-account records stay intact.
 */
export async function deleteMyAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      origin: true,
      appleRefreshToken: true,
      authAccounts: {
        where: { provider: "apple" },
        select: { appleRefreshToken: true },
      },
    },
  });

  if (!user) {
    return;
  }

  if (user.origin === USER_ORIGIN.SEEDED) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);
  }

  try {
    const appleTokens = [
      user.appleRefreshToken,
      ...user.authAccounts.map((account) => account.appleRefreshToken),
    ];

    await Promise.all(
      appleTokens.map((refreshToken) => revokeAppleRefreshToken(refreshToken))
    );
  } catch (error) {
    console.error("[APPLE_AUTH] Failed to revoke Apple refresh token", error);
  }

  // Snapshot circle memberships before the cascades remove them: account
  // deletion is a silent leave from every circle, and each circle must be
  // re-evaluated (dissolve/complete) once the rows are gone.
  const circleIdsToReevaluate = (
    await prisma.circleMember.findMany({
      where: { userId, state: { in: ["active", "done"] } },
      select: { circleId: true },
    })
  ).map((membership) => membership.circleId);

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: userId },
      data: { fcmToken: null },
    });

    await tx.notification.deleteMany({
      where: { OR: [{ userId }, { senderId: userId }] },
    });

    await tx.feedback.updateMany({
      where: { userId },
      data: { userId: null },
    });

    await tx.referral.deleteMany({ where: { inviterId: userId } });
    await tx.referral.updateMany({
      where: { inviteeId: userId },
      data: { inviteeId: null },
    });
    await tx.referralLink.deleteMany({ where: { userId } });
    await tx.referralCode.deleteMany({ where: { userId } });
    await tx.featureFlags.deleteMany({ where: { userId } });
    await tx.userBlock.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    await tx.taskReport.deleteMany({
      where: { OR: [{ reporterId: userId }, { reportedUserId: userId }] },
    });
    await tx.follow.deleteMany({
      where: { OR: [{ followerId: userId }, { followingId: userId }] },
    });

    await tx.commentLike.deleteMany({
      where: {
        OR: [
          { userId },
          { comment: { userId } },
          { comment: { task: { userId } } },
        ],
      },
    });
    await tx.cheer.deleteMany({
      where: { OR: [{ userId }, { task: { userId } }] },
    });
    await tx.push.deleteMany({
      where: { OR: [{ userId }, { task: { userId } }] },
    });
    await tx.vote.deleteMany({
      where: { OR: [{ userId }, { task: { userId } }] },
    });
    await tx.reminderNote.deleteMany({
      where: { OR: [{ senderId: userId }, { task: { userId } }] },
    });
    await tx.progressUpdate.deleteMany({
      where: { OR: [{ senderId: userId }, { task: { userId } }] },
    });
    await tx.comment.deleteMany({
      where: { OR: [{ userId }, { task: { userId } }] },
    });

    await tx.task.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });

  for (const circleId of circleIdsToReevaluate) {
    await evaluateCircleLifecycle(circleId);
  }
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
      username: true,
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
        message: getFollowNotificationMessage(follower?.name ?? "Someone"),
        metadata: {
          followerId,
          followerName: follower?.name,
          followerPhoto: follower?.photo,
        },
      },
    });

    const followedUser = await prisma.user.findUnique({
      where: { id: followingId },
      select: { fcmToken: true },
    });

    if (followedUser?.fcmToken) {
      const { title, body } = getFollowPushText(follower?.name ?? "Someone");
      await sendPushNotification(followedUser.fcmToken, title, body, {
        notificationType: "follow",
        screen: "NotificationMainScreen",
      });
    }

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
          username: true,
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
      username: true,
      photo: true,
      createdAt: true,
      // Delivered in GET /users/me so first-time hints hydrate on session
      // start (reinstalls / second devices).
      firstTimeHints: true,
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

export async function getPushesGivenCount(userId: string) {
  return prisma.push.count({
    where: { userId },
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

  const blockedUserIds = await getBlockedUserIdsForViewer(userId);
  const blockedUserIdSet = new Set(blockedUserIds);
  const followingIds = following
    .map((f) => f.followingId)
    .filter((followingId) => !blockedUserIdSet.has(followingId));
  const followingIdSet = new Set(followingIds);

  // Fetch all matching users except the requester
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId, notIn: blockedUserIds },
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

type HomeSummaryEntity = {
  type: "task";
  taskId: string;
  taskText: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
};

type HomeSuccessStory = {
  type: "success_story";
  title: string;
  body: string;
  entity: HomeSummaryEntity;
  timestamps: { contributedAt: string; resultAt: string };
};

type HomeFeaturedStory = {
  type: "motivation-success";
  taskId: string;
  taskText: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
  pushedAt: string | null;
  completedAt: string | null;
};

type HomeCompactStatus = {
  streakDay: number;
  pushedTodayCount: number;
};

export async function getHomeSummaryForUser(
  userId: string,
  utcOffsetMinutes = 0
) {
  // Who the current user follows — the home feed only cares about these people.
  const [following, compactStatus, ownGoal] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    getHomeCompactStatusForUser(userId, utcOffsetMinutes),
    // The user's own most recent active goal — authoritative source for the
    // "Your goal" card (decoupled from the shared "needs a push" feed).
    prisma.task.findFirst({
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
  const blockedUserIds = await getBlockedUserIdsForViewer(userId);
  const blockedUserIdSet = new Set(blockedUserIds);
  const followingIds = following
    .map((f) => f.followingId)
    .filter((followingId) => !blockedUserIdSet.has(followingId));

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
    prisma.task.findMany({
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
    // Anonymous goals are excluded: the card names its owner by design.
    prisma.task.findFirst({
      where: {
        completed: true,
        completedAt: { not: null },
        userId: { in: followingIds },
        type: "motivation",
        isAnonymous: false,
        Push: { some: { userId } },
      },
      orderBy: { completedAt: "desc" },
      include: {
        user: { select: { id: true, name: true, photo: true } },
        Push: { where: { userId }, select: { createdAt: true }, take: 1 },
      },
    }),
  ]);

  const peopleNeedYourPushToday = new Set(
    pushableTasks.map((t) => t.userId)
  ).size;
  // Reply/advice/decision mechanics are deprecated (motivation-only product).
  // Field kept for the mobile contract; always 0 now.
  const replyWaitingCount = 0;

  let successStory: HomeSuccessStory | null = null;
  let featuredStory: HomeFeaturedStory | null = null;

  if (pushedCompleted && pushedCompleted.completedAt) {
    const owner = pushedCompleted.user;
    const pushedAt = pushedCompleted.Push[0]?.createdAt ?? null;
    const entity: HomeSummaryEntity = {
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

async function getHomeCompactStatusForUser(
  userId: string,
  utcOffsetMinutes: number
): Promise<HomeCompactStatus> {
  const now = new Date();
  const todayRange = getUtcRangeForLocalDate(now, utcOffsetMinutes);
  const since = new Date(todayRange.start.getTime() - 370 * 24 * 60 * 60 * 1000);

  const [pushedTodayCount, recentPushes] = await Promise.all([
    prisma.push.count({
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
    prisma.push.findMany({
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

  const pushDayKeys = new Set(
    recentPushes.map((push) => getLocalDateKey(push.createdAt, utcOffsetMinutes))
  );
  const todayKey = getLocalDateKey(now, utcOffsetMinutes);

  if (!pushDayKeys.has(todayKey)) {
    return { streakDay: 0, pushedTodayCount: 0 };
  }

  const localCursor = getLocalDateParts(now, utcOffsetMinutes);
  const cursorDate = new Date(
    Date.UTC(localCursor.year, localCursor.month, localCursor.day)
  );
  let streakDay = 0;

  while (pushDayKeys.has(toDateKey(cursorDate))) {
    streakDay += 1;
    cursorDate.setUTCDate(cursorDate.getUTCDate() - 1);
  }

  return { streakDay, pushedTodayCount };
}

function getUtcRangeForLocalDate(date: Date, utcOffsetMinutes: number) {
  const parts = getLocalDateParts(date, utcOffsetMinutes);
  const start = new Date(
    Date.UTC(parts.year, parts.month, parts.day) -
      utcOffsetMinutes * 60 * 1000
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

function getLocalDateKey(date: Date, utcOffsetMinutes: number) {
  const parts = getLocalDateParts(date, utcOffsetMinutes);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month + 1).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getLocalDateParts(date: Date, utcOffsetMinutes: number) {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60 * 1000);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function toDateKey(date: Date) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
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
    pushesGiven,
  ] = await Promise.all([
    getFollowersCount(targetUserId),
    getFollowingCount(targetUserId),
    getTaskStatsForUser(targetUserId),
    getRecentTasksForUserProfile(targetUserId, currentUserId, 5),
    currentUserId ? getMutualFriends(currentUserId, targetUserId) : [],
    getPushesGivenCount(targetUserId),
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
    username: user.username,
    photo: user.photo,
    bio: null,
    followersCount,
    followingCount,
    isFollowing,
    isFollowedBy,
    recentTasks,
    mutualFriends,
    pushesGiven,
    taskSuccessRate: taskStats.successRate,
    tasksDone: taskStats.tasksDone,
    dayStreak: taskStats.dayStreak,
  };
}

const MS_PER_DAY = 86_400_000;

// Giving-first stats for the private "Your impact" screen. All "task"
// wording is the server contract; the client renders these as goals.
export async function getImpactForUser(userId: string) {
  const publicUserSelect = {
    id: true,
    name: true,
    username: true,
    photo: true,
    avatarInitial: true,
    avatarColor: true,
  } as const;

  const [
    pushesGiven,
    cheersSent,
    tasksFinished,
    cheersReceived,
    pushesReceived,
    cheersOnCompletedTasks,
  ] = await Promise.all([
    prisma.push.findMany({
      where: { userId },
      select: {
        task: {
          select: { completed: true, user: { select: publicUserSelect } },
        },
      },
    }),
    prisma.cheer.count({ where: { userId } }),
    prisma.task.count({ where: { userId, completed: true } }),
    prisma.cheer.count({ where: { userId: { not: userId }, task: { userId } } }),
    prisma.push.count({ where: { userId: { not: userId }, task: { userId } } }),
    prisma.cheer.findMany({
      where: { userId, task: { completed: true, userId: { not: userId } } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        presetTextSnapshot: true,
        createdAt: true,
        task: {
          select: {
            text: true,
            completedAt: true,
            user: { select: publicUserSelect },
          },
        },
      },
    }),
  ]);

  const ownersPushed = new Map<string, PublicUserRecord>();
  const ownersHelped = new Map<string, PublicUserRecord>();
  for (const push of pushesGiven) {
    const owner = push.task.user;
    ownersPushed.set(owner.id, owner);
    if (push.task.completed) ownersHelped.set(owner.id, owner);
  }

  // "The cheer that mattered most": the cheer with the shortest gap between
  // cheering and the task getting finished.
  const bestCheer = cheersOnCompletedTasks
    .filter(
      (cheer) =>
        cheer.task.completedAt &&
        cheer.task.completedAt.getTime() >= cheer.createdAt.getTime()
    )
    .sort(
      (a, b) =>
        a.task.completedAt!.getTime() -
        a.createdAt.getTime() -
        (b.task.completedAt!.getTime() - b.createdAt.getTime())
    )[0];

  return {
    peopleHelped: {
      count: ownersHelped.size,
      preview: [...ownersHelped.values()].slice(0, 6).map(toPublicUser),
    },
    giving: {
      peoplePushed: ownersPushed.size,
      cheersSent,
      tasksBacked: pushesGiven.length,
    },
    topCheer: bestCheer
      ? {
          recipient: toPublicUser(bestCheer.task.user),
          taskText: bestCheer.task.text,
          cheerText: bestCheer.presetTextSnapshot,
          cheeredAt: bestCheer.createdAt.toISOString(),
          completedAt: bestCheer.task.completedAt!.toISOString(),
          daysToFinish: Math.round(
            (bestCheer.task.completedAt!.getTime() -
              bestCheer.createdAt.getTime()) /
              MS_PER_DAY
          ),
        }
      : null,
    journey: { tasksFinished, cheersReceived, pushesReceived },
  };
}
