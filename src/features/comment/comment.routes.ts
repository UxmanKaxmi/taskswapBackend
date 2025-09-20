import express from "express";
import {
  handleCreateComment,
  handleGetComments,
  handleToggleLike,
} from "./comment.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = express.Router();

// Create a new comment
router.post("/", requireAuth, handleCreateComment);

// Get comments for a specific task
router.get("/:taskId", requireAuth, handleGetComments);

// Toggle like (heart) for a comment
router.post("/like", requireAuth, handleToggleLike);

export default router;
