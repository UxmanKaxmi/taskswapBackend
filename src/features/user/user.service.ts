import { User } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";

export async function syncUserToDB({
  id,
  email,
  name,
  photo,
}: {
  id: string;
  email: string;
  name: string;
  photo?: string;
}) {
  return prisma.user.upsert({
    where: { id },
    update: { name, email, photo },
    create: { id, name, email, photo },
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

// export async function followUser(followerId: string, followingId: string) {
//   console.log("[followUser] incoming:", { followerId, followingId });

//   if (followerId === followingId) {
//     throw new AppError("You cannot follow yourself.", HttpStatus.BAD_REQUEST);
//   }

//   const existing = await prisma.follow.findUnique({
//     where: {
//       followerId_followingId: {
//         followerId,
//         followingId,
//       },
//     },
//   });

//   console.log("[followUser] existing follow:", existing);

//   if (existing) {
//     throw new AppError("You already follow this user.", HttpStatus.CONFLICT);
//   }

//   const follow = await prisma.follow.create({
//     data: { followerId, followingId },
//   });

//   console.log("[followUser] follow created:", follow);

//   return { success: true };
// }

// export async function unfollowUser(followerId: string, followingId: string) {
//   await prisma.follow.deleteMany({
//     where: {
//       followerId,
//       followingId,
//     },
//   });

//   return { success: true };
// }

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
