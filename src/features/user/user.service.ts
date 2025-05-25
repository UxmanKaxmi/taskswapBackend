import { User } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";

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
  if (followerId === followingId) {
    throw new AppError("You cannot follow yourself.", 400);
  }

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
}

export async function getFollowers(userId: string) {
  // Get raw follower connections
  const followers = await prisma.follow.findMany({
    where: { followingId: userId },
    include: {
      follower: {
        select: { id: true, name: true, email: true, photo: true },
      },
    },
  });

  // Get whom the current user is following
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = new Set(following.map((f) => f.followingId));

  console.log(
    followers
      .filter((f) => f.follower !== null)
      .map((f) => ({
        ...f.follower,
        isFollowing: followingIds.has(f.follower.id),
      }))
  );
  return followers
    .filter((f) => f.follower !== null)
    .map((f) => ({
      ...f.follower,
      isFollowing: followingIds.has(f.follower.id),
    }));
}

export async function getFollowing(userId: string) {
  const followings = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      following: {
        select: { id: true, name: true, email: true, photo: true },
      },
    },
  });
  console.log(
    followings
      .filter((f) => f.following !== null)
      .map((f) => ({
        ...f.following,
        isFollowing: true,
      }))
  );

  return followings
    .filter((f) => f.following !== null)
    .map((f) => ({
      ...f.following,
      isFollowing: true,
    }));
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
