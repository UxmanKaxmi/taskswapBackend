import { Router } from "express";
import { verifyGoogleToken } from "../../middleware/verifyGoogleToken";
import {
  handleGetFollowers,
  handleGetFollowing,
  handleMatchUsers,
  handleSyncUser,
  handleToggleFollowUser,
} from "./user.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/", verifyGoogleToken, handleSyncUser);
router.post("/match", handleMatchUsers);

// router.post("/follow", requireAuth, handleFollowUser);
// router.post("/unfollow", requireAuth, handleUnfollowUser);
router.get("/toggleFollow/:userId", requireAuth, handleToggleFollowUser);
router.get("/followers", requireAuth, handleGetFollowers);
router.get("/following", requireAuth, handleGetFollowing);
export default router;
