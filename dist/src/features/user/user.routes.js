"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const verifyGoogleToken_1 = require("../../middleware/verifyGoogleToken");
const user_controller_1 = require("./user.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const requireJwtAuth_1 = require("../../middleware/requireJwtAuth");
const optionalAuth_1 = require("../../middleware/optionalAuth");
const router = (0, express_1.Router)();
// Sync/login user
router.post("/", verifyGoogleToken_1.verifyAuthProviderToken, user_controller_1.handleSyncUser);
router.post("/google-sync", verifyGoogleToken_1.verifyAuthProviderToken, user_controller_1.handleSyncUser);
// Match contacts (auth required)
router.post("/match", requireAuth_1.requireAuth, user_controller_1.handleMatchUsers);
// Follow/unfollow
router.get("/toggleFollow/:userId", requireAuth_1.requireAuth, user_controller_1.handleToggleFollowUser);
// ⭐ PUBLIC GET ENDPOINTS — FIXED
router.get("/followers", optionalAuth_1.optionalAuth, user_controller_1.handleGetFollowers);
router.get("/following", optionalAuth_1.optionalAuth, user_controller_1.handleGetFollowing);
router.get("/me", requireAuth_1.requireAuth, user_controller_1.handleGetMe);
// FCM token refresh — works for any auth provider (Google, Apple) since it
// uses the backend JWT instead of a provider identity token
router.patch("/me/fcm-token", requireAuth_1.requireAuth, user_controller_1.handleUpdateFcmToken);
// Account deletion (Apple 5.1.1(v)) — identity comes from the token, not params
router.delete("/me", requireJwtAuth_1.requireJwtAuth, user_controller_1.handleDeleteMe);
// Home dashboard summary for the logged-in user
router.get("/me/home-summary", requireAuth_1.requireAuth, user_controller_1.handleGetHomeSummary);
// Private giving-first stats for the "Your impact" screen
router.get("/me/impact", requireAuth_1.requireAuth, user_controller_1.handleGetMyImpact);
// Search friends (still requires auth)
router.get("/search-friends", requireAuth_1.requireAuth, user_controller_1.searchFriends);
// ⭐ PUBLIC PROFILE VIEW — FIXED
router.get("/:id/profile", optionalAuth_1.optionalAuth, user_controller_1.handleGetUserProfile);
exports.default = router;
