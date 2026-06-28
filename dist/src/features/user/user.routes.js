"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const verifyGoogleToken_1 = require("../../middleware/verifyGoogleToken");
const user_controller_1 = require("./user.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const optionalAuth_1 = require("../../middleware/optionalAuth");
const router = (0, express_1.Router)();
// Sync/login user
router.post("/", verifyGoogleToken_1.verifyGoogleToken, user_controller_1.handleSyncUser);
// Match contacts (auth required)
router.post("/match", requireAuth_1.requireAuth, user_controller_1.handleMatchUsers);
// Follow/unfollow
router.get("/toggleFollow/:userId", requireAuth_1.requireAuth, user_controller_1.handleToggleFollowUser);
// ⭐ PUBLIC GET ENDPOINTS — FIXED
router.get("/followers", optionalAuth_1.optionalAuth, user_controller_1.handleGetFollowers);
router.get("/following", optionalAuth_1.optionalAuth, user_controller_1.handleGetFollowing);
// Profile of currently logged-in user
router.get("/me", requireAuth_1.requireAuth, user_controller_1.handleGetMe);
// Home dashboard summary for the logged-in user
router.get("/me/home-summary", requireAuth_1.requireAuth, user_controller_1.handleGetHomeSummary);
// Search friends (still requires auth)
router.get("/search-friends", requireAuth_1.requireAuth, user_controller_1.searchFriends);
// ⭐ PUBLIC PROFILE VIEW — FIXED
router.get("/:id/profile", optionalAuth_1.optionalAuth, user_controller_1.handleGetUserProfile);
exports.default = router;
