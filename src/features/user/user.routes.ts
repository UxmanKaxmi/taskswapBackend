import { Router } from "express";
import { verifyGoogleToken } from "../../middleware/verifyGoogleToken";
import {
  handleGetFollowers,
  handleGetFollowing,
  handleGetMe,
  handleMatchUsers,
  handleSyncUser,
  handleToggleFollowUser,
  searchFriends,
} from "./user.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/", verifyGoogleToken, handleSyncUser);
router.post("/match", requireAuth, handleMatchUsers);

// router.post("/follow", requireAuth, handleFollowUser);
// router.post("/unfollow", requireAuth, handleUnfollowUser);
router.get("/toggleFollow/:userId", requireAuth, handleToggleFollowUser);
router.get("/followers", requireAuth, handleGetFollowers);
router.get("/following", requireAuth, handleGetFollowing);
router.get("/me", requireAuth, handleGetMe);

router.get("/search-friends", requireAuth, searchFriends);

export default router;
