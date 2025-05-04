import { Router } from "express";
import { verifyGoogleToken } from "../../middleware/verifyGoogleToken";
import { handleSyncUser } from "./user.controller";

const router = Router();

router.post("/", verifyGoogleToken, handleSyncUser);

export default router;
