import express from "express";
import {
  handleCreateComment,
  handleGetComments,
  handleToggleLike,
} from "./comment.controller";
import { requireAuth } from "../../middleware/requireAuth";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = express.Router();

// Create a new comment → login required
router.post("/", requireAuth, handleCreateComment);

// Get comments for a specific task → PUBLIC
router.get("/:taskId", optionalAuth, handleGetComments);

// Toggle like for a comment → login required
router.post("/like", requireAuth, handleToggleLike);

export default router;