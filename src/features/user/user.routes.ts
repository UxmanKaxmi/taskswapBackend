import { Router } from "express";
import {
  verifyAuthProviderToken,
  verifyGoogleToken,
} from "../../middleware/verifyGoogleToken";
import {
  handleGetFollowers,
  handleGetFollowing,
  handleGetHomeSummary,
  handleGetMe,
  handleGetMyImpact,
  handleGetUserProfile,
  handleMatchUsers,
  handleSyncUser,
  handleToggleFollowUser,
  handleDeleteMe,
  handleUpdateFcmToken,
  searchFriends,
} from "./user.controller";
import { requireAuth } from "../../middleware/requireAuth";
import { requireJwtAuth } from "../../middleware/requireJwtAuth";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = Router();

// Sync/login user
router.post("/", verifyAuthProviderToken, handleSyncUser);
router.post("/google-sync", verifyAuthProviderToken, handleSyncUser);

// Match contacts (auth required)
router.post("/match", requireAuth, handleMatchUsers);

// Follow/unfollow
router.get("/toggleFollow/:userId", requireAuth, handleToggleFollowUser);

// ⭐ PUBLIC GET ENDPOINTS — FIXED
router.get("/followers", optionalAuth, handleGetFollowers);
router.get("/following", optionalAuth, handleGetFollowing);

router.get("/me", requireAuth, handleGetMe);

// FCM token refresh — works for any auth provider (Google, Apple) since it
// uses the backend JWT instead of a provider identity token
router.patch("/me/fcm-token", requireAuth, handleUpdateFcmToken);

// Account deletion (Apple 5.1.1(v)) — identity comes from the token, not params
router.delete("/me", requireJwtAuth, handleDeleteMe);

// Home dashboard summary for the logged-in user
router.get("/me/home-summary", requireAuth, handleGetHomeSummary);

// Private giving-first stats for the "Your impact" screen
router.get("/me/impact", requireAuth, handleGetMyImpact);

// Search friends (still requires auth)
router.get("/search-friends", requireAuth, searchFriends);

// ⭐ PUBLIC PROFILE VIEW — FIXED
router.get("/:id/profile", optionalAuth, handleGetUserProfile);

export default router;
