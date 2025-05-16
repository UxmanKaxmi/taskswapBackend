import { Router } from "express";
import { verifyGoogleToken } from "../../middleware/verifyGoogleToken";
import { handleMatchUsers, handleSyncUser } from "./user.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/", verifyGoogleToken, handleSyncUser);
router.post("/match", handleMatchUsers);

export default router;
