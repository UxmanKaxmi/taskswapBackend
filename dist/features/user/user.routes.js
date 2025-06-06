"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const verifyGoogleToken_1 = require("../../middleware/verifyGoogleToken");
const user_controller_1 = require("./user.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const router = (0, express_1.Router)();
router.post("/", verifyGoogleToken_1.verifyGoogleToken, user_controller_1.handleSyncUser);
router.post("/match", requireAuth_1.requireAuth, user_controller_1.handleMatchUsers);
// router.post("/follow", requireAuth, handleFollowUser);
// router.post("/unfollow", requireAuth, handleUnfollowUser);
router.get("/toggleFollow/:userId", requireAuth_1.requireAuth, user_controller_1.handleToggleFollowUser);
router.get("/followers", requireAuth_1.requireAuth, user_controller_1.handleGetFollowers);
router.get("/following", requireAuth_1.requireAuth, user_controller_1.handleGetFollowing);
router.get("/me", requireAuth_1.requireAuth, user_controller_1.handleGetMe);
router.get("/search-friends", requireAuth_1.requireAuth, user_controller_1.searchFriends);
router.get("/:id/profile", requireAuth_1.requireAuth, user_controller_1.handleGetUserProfile);
exports.default = router;
