import { Request, Response, NextFunction } from "express";
import {
  getFollowers,
  getFollowing,
  getUserById,
  matchUsersByEmail,
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
  const followerId = req.userId;

  if (!Array.isArray(emails)) {
    return next(new AppError("`emails` must be an array", 400));
  }

  try {
    const users = await matchUsersByEmail(emails, followerId);
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

//     const followerId = req.userId;
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
//     const followerId = req.userId;
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
  try {
    const followerId = req.userId;
    const followingId = req.params.userId;

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
    const followers = await getFollowers(req.userId);
    res.status(200).json(followers); // ✅ Already contains `isFollowing`
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError("Failed to fetch followers", 500));
  }
}

export async function handleGetFollowing(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const following = await getFollowing(req.userId);
    res.status(200).json(following);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError("Failed to fetch following", 500));
  }
}

export async function handleGetMe(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.userId;
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
