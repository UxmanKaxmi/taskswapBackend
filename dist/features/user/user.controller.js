"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSyncUser = handleSyncUser;
exports.handleMatchUsers = handleMatchUsers;
exports.handleToggleFollowUser = handleToggleFollowUser;
exports.handleGetFollowers = handleGetFollowers;
exports.handleGetFollowing = handleGetFollowing;
exports.handleGetMe = handleGetMe;
const user_service_1 = require("./user.service");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errors_1 = require("../../errors");
const AppError_1 = require("../../errors/AppError");
const user_service_2 = require("./user.service");
async function handleSyncUser(req, res, next) {
  const { id, email, name, photo, fcmToken } = req.body;
  console.log("[HANDLE_SYNC_USER] Request body:", req.body);
  if (!id || !email || !name) {
    console.log("[HANDLE_SYNC_USER] Missing required user fields");
    return next(new errors_1.BadRequestError("Missing required user fields"));
  }
  try {
    const user = await (0, user_service_1.syncUserToDB)({
      id,
      email,
      name,
      photo,
      fcmToken,
    });
    console.log("[HANDLE_SYNC_USER] User synced to DB:", user);
    const token = jsonwebtoken_1.default.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );
    console.log("[HANDLE_SYNC_USER] JWT token generated");
    res.status(200).json({ user, token });
  } catch (error) {
    console.error("[USER_API_ERROR]", error);
    next(new AppError_1.AppError("Failed to sync user", 500));
  }
}
async function handleMatchUsers(req, res, next) {
  const { emails } = req.body;
  const userId = req.user?.id;
  if (!Array.isArray(emails)) {
    return next(new AppError_1.AppError("`emails` must be an array", 400));
  }
  try {
    const users = await (0, user_service_1.matchUsersByEmail)(
      emails,
      followerId
    );
    res.json(users);
  } catch (error) {
    if (error instanceof AppError_1.AppError) return next(error);
    next(new AppError_1.AppError("Failed to match users", 500));
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
async function handleToggleFollowUser(req, res, next) {
  try {
    const userId = req.user?.id;
    const followingId = req.params.userId;
    const result = await (0, user_service_1.toggleFollowUser)(
      followerId,
      followingId
    );
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError_1.AppError) return next(error);
    next(new AppError_1.AppError("Failed to toggle follow", 500));
  }
}
async function handleGetFollowers(req, res, next) {
  try {
    const followers = await (0, user_service_1.getFollowers)(req.userId);
    res.status(200).json(followers); // ✅ Already contains `isFollowing`
  } catch (error) {
    if (error instanceof AppError_1.AppError) return next(error);
    next(new AppError_1.AppError("Failed to fetch followers", 500));
  }
}
async function handleGetFollowing(req, res, next) {
  try {
    const following = await (0, user_service_1.getFollowing)(req.userId);
    res.status(200).json(following);
  } catch (error) {
    if (error instanceof AppError_1.AppError) return next(error);
    next(new AppError_1.AppError("Failed to fetch following", 500));
  }
}
async function handleGetMe(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError_1.AppError("Unauthorized", 401));
    const user = await (0, user_service_1.getUserById)(userId);
    if (!user) return next(new AppError_1.AppError("User not found", 404));
    const [followersCount, followingCount, taskStats] = await Promise.all([
      (0, user_service_2.getFollowersCount)(userId),
      (0, user_service_2.getFollowingCount)(userId),
      (0, user_service_2.getTaskStatsForUser)(userId),
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
    next(new AppError_1.AppError("Failed to fetch user profile", 500));
  }
}
