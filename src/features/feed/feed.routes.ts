import { Router } from "express";
import { getFeed } from "./feed.controller";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = Router();

// GET /feed → Handles guest + logged-in users
router.get("/", optionalAuth, getFeed);

export default router;