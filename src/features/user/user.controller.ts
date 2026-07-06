import { Request, Response, NextFunction } from "express";
import {
  getFollowers,
  getFollowing,
  getUserById,
  matchUsersByEmail,
  searchFriendsService,
  syncUserToDB,
  toggleFollowUser,
  deleteMyAccount,
  updateFcmToken,
} from "./user.service";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";
import { BadRequestError } from "../../errors";
import { AppError } from "../../errors/AppError";
import { getUserProfileById } from "./user.service";
import { getParamString } from "../../utils/params";

import {
  getFollowersCount,
  getFollowingCount,
  getTaskStatsForUser,
  getHomeSummaryForUser,
  getImpactForUser,
} from "./user.service";

export async function handleSyncUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const {
    id,
    email,
    name,
    photo,
    fcmToken,
    provider,
    providerUserId,
    authorizationCode,
  } = req.body;

  if (!id || !provider || !providerUserId) {
    return next(new BadRequestError("Missing required user fields"));
  }

  try {
    const user: User = await syncUserToDB({
      id,
      email,
      name,
      photo,
      fcmToken,
      provider,
      providerUserId,
      authorizationCode,
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.status(200).json({ user, token });
  } catch (error) {
    console.error("[USER_API_ERROR]", error);
    if (error instanceof AppError) return next(error);
    next(new AppError("Failed to sync user", 500));
  }
}

export async function handleUpdateFcmToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  const { fcmToken } = req.body ?? {};

  if (!userId) {
    return next(new AppError("Unauthorized", 401));
  }

  if (typeof fcmToken !== "string" || !fcmToken.trim()) {
    return next(new BadRequestError("`fcmToken` is required"));
  }

  try {
    await updateFcmToken(userId, fcmToken.trim());
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("[FCM_TOKEN_UPDATE_ERROR]", error);
    next(new AppError("Failed to update FCM token", 500));
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
  const followingId = getParamString(req.params.userId);

  if (followerId && followingId && followerId === followingId) {
    throw new AppError("You cannot follow yourself", 400);
  }

  if (!followerId) {
    return next(new AppError("Unauthorized", 401));
  }
  if (!followingId) {
    return next(new AppError("Missing followingId", 400));
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
  const targetUserId =
    getParamString(req.query.userId) || req.user?.id || null;

  if (!targetUserId) {
    return res.status(200).json([]);
  }

  const followers = await getFollowers(targetUserId);
  res.status(200).json(followers);
}

export async function handleGetFollowing(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const targetUserId =
      getParamString(req.params.userId) || req.user?.id || null;

    if (!targetUserId) {
      return res.status(200).json([]);
    }

    const following = await getFollowing(targetUserId);
    res.status(200).json(following);
  } catch (error) {
    next(error);
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
    });
  } catch (err) {
    next(new AppError("Failed to fetch user profile", 500));
  }
}

export async function handleGetMyImpact(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError("Unauthorized", 401));

    const impact = await getImpactForUser(userId);
    res.status(200).json(impact);
  } catch (err) {
    console.error("[IMPACT_ERROR]", err);
    next(new AppError("Failed to fetch impact stats", 500));
  }
}

export async function handleDeleteMe(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError("Unauthorized", 401));

    await deleteMyAccount(userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function handleGetHomeSummary(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError("Unauthorized", 401));

    const utcOffsetMinutes = parseUtcOffsetMinutes(req.query.utcOffsetMinutes);
    const summary = await getHomeSummaryForUser(userId, utcOffsetMinutes);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[HOME_SUMMARY_ERROR]", err);
    next(new AppError("Failed to fetch home summary", 500));
  }
}

function parseUtcOffsetMinutes(value: unknown): number {
  const raw = getParamString(value);
  const parsed = raw ? Number(raw) : 0;

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(-14 * 60, Math.min(14 * 60, Math.trunc(parsed)));
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

export async function handleGetUserProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const targetUserId = getParamString(req.params.id);
  const currentUserId = req.user?.id ?? null;

  if (!targetUserId) {
    return next(new AppError("Invalid user ID", 400));
  }

  try {
    const profile = await getUserProfileById(targetUserId, currentUserId);
    res.status(200).json(profile);
  } catch (error) {
    next(
      error instanceof AppError ? error : new AppError("Unexpected error", 500)
    );
  }
}
