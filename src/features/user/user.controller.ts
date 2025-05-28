import { Request, Response, NextFunction } from "express";
import {
  getFollowers,
  getFollowing,
  getUserById,
  matchUsersByEmail,
  searchFriendsService,
  syncUserToDB,
  toggleFollowUser,
} from "./user.service";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";
import { BadRequestError } from "../../errors";
import { AppError } from "../../errors/AppError";

import {
  getFollowersCount,
  getFollowingCount,
  getTaskStatsForUser,
} from "./user.service";

export async function handleSyncUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id, email, name, photo, fcmToken } = req.body;

  console.log("[HANDLE_SYNC_USER] Request body:", req.body);

  if (!id || !email || !name) {
    console.log("[HANDLE_SYNC_USER] Missing required user fields");
    return next(new BadRequestError("Missing required user fields"));
  }

  try {
    const user: User = await syncUserToDB({ id, email, name, photo, fcmToken });

    console.log("[HANDLE_SYNC_USER] User synced to DB:", user);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    console.log("[HANDLE_SYNC_USER] JWT token generated");

    res.status(200).json({ user, token });
  } catch (error) {
    console.error("[USER_API_ERROR]", error);
    next(new AppError("Failed to sync user", 500));
  }
}

export async function handleMatchUsers(
  req: Request<{}, {}, { emails: string[] }>,
  res: Response,
  next: NextFunction
) {
  const { emails } = req.body;
  const userId = req.user?.id;
  console.log("🔐 userId:", req.user?.id);
  if (!Array.isArray(emails)) {
    return next(new AppError("`emails` must be an array", 400));
  }
  if (!userId) {
    return next(new AppError("Unauthorized", 401));
  }

  try {
    const users = await matchUsersByEmail(emails, userId);
    res.json(users);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError("Failed to match users", 500));
  }
}

// export async function handleFollowUser(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     if (!req.userId) {
//       return next(new AppError("Unauthorized: Missing user ID", 401));
//     }

//     const userId = req.user?.id;;
//     const { followingId } = req.body || {};

//     if (!followingId) {
//       return next(new AppError("Missing `followingId`", 400));
//     }

//     const result = await followUser(followerId, followingId);
//     res.status(201).json(result);
//   } catch (error) {
//     if (error instanceof AppError) return next(error);
//     next(new AppError("Failed to follow user", 500));
//   }
// }

// export async function handleUnfollowUser(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const userId = req.user?.id;;
//     const { followingId } = req.body;

//     if (!followingId) {
//       return next(new AppError("Missing `followingId`", 400));
//     }

//     const result = await unfollowUser(followerId, followingId);
//     res.status(200).json(result);
//   } catch (error) {
//     if (error instanceof AppError) return next(error);
//     next(new AppError("Failed to unfollow user", 500));
//   }
// }

export async function handleToggleFollowUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const followerId = req.user?.id;
  const followingId = req.params.userId;

  if (followerId === followingId) {
    throw new AppError("You cannot follow yourself", 400);
  }

  if (!followerId) {
    return next(new AppError("Unauthorized", 401));
  }

  try {
    const result = await toggleFollowUser(followerId, followingId);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError("Failed to toggle follow", 500));
  }
}

export async function handleGetFollowers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return next(new AppError("Unauthorized: Missing user ID", 401));
    }

    const followers = await getFollowers(req.user?.id);
    res.status(200).json(followers);
  } catch (error) {
    next(new AppError("Failed to fetch followers", 500));
  }
}

export async function handleGetFollowing(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return next(new AppError("Unauthorized: Missing user ID", 401));
    }

    const following = await getFollowing(req.user?.id);
    console.log("💥 Backend userId:", req.user?.id);
    res.status(200).json(following);
  } catch (error) {
    next(new AppError("Failed to fetch following", 500));
  }
}

export async function handleGetMe(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError("Unauthorized", 401));

    const user = await getUserById(userId);
    if (!user) return next(new AppError("User not found", 404));

    const [followersCount, followingCount, taskStats] = await Promise.all([
      getFollowersCount(userId),
      getFollowingCount(userId),
      getTaskStatsForUser(userId),
    ]);

    res.status(200).json({
      ...user,
      followersCount,
      followingCount,
      taskSuccessRate: taskStats.successRate,
      tasksDone: taskStats.tasksDone,
      dayStreak: taskStats.dayStreak,
    });
  } catch (err) {
    next(new AppError("Failed to fetch user profile", 500));
  }
}

export async function searchFriends(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { query, includeFollowed = "false" } = req.query;
  const userId = req.user?.id;

  if (!query || typeof query !== "string") {
    return next(new BadRequestError("Query is required"));
  }

  if (!userId || typeof userId !== "string") {
    return next(new BadRequestError("Unauthorized: Missing user ID"));
  }

  try {
    const friends = await searchFriendsService(
      userId,
      query,
      includeFollowed === "true"
    );
    res.status(200).json({ friends });
  } catch (error) {
    console.error("[SEARCH_FRIENDS_ERROR]", error);
    next(new AppError("Failed to search friends", 500));
  }
}
