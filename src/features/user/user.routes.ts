import { Router } from "express";
import { verifyGoogleToken } from "../../middleware/verifyGoogleToken";
import {
  handleGetFollowers,
  handleGetFollowing,
  handleGetHomeSummary,
  handleGetMe,
  handleGetUserProfile,
  handleMatchUsers,
  handleSyncUser,
  handleToggleFollowUser,
  searchFriends,
} from "./user.controller";
import { requireAuth } from "../../middleware/requireAuth";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = Router();

// Sync/login user
router.post("/", verifyGoogleToken, handleSyncUser);
router.post("/google-sync", verifyGoogleToken, handleSyncUser);

// Match contacts (auth required)
router.post("/match", requireAuth, handleMatchUsers);

// Follow/unfollow
router.get("/toggleFollow/:userId", requireAuth, handleToggleFollowUser);

// ⭐ PUBLIC GET ENDPOINTS — FIXED
router.get("/followers", optionalAuth, handleGetFollowers);
router.get("/following", optionalAuth, handleGetFollowing);

// Profile of currently logged-in user
router.get("/me/home-summary", optionalAuth, handleGetHomeSummary);
router.get("/me", requireAuth, handleGetMe);

// Search friends (still requires auth)
router.get("/search-friends", requireAuth, searchFriends);

// ⭐ PUBLIC PROFILE VIEW — FIXED
router.get("/:id/profile", optionalAuth, handleGetUserProfile);

export default router;
