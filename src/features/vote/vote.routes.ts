import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { castVote, getVotes, handleGetVote } from "./vote.controller";

const router = express.Router();

router.get("/", handleGetVote); // Optional test route

// Requires auth
router.post("/tasks/:id/vote", requireAuth, castVote);
router.get("/tasks/:id/votes", requireAuth, getVotes);

export default router;
