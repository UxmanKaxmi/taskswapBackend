import { Router } from "express";
import {
  handleCreateTask,
  handleGetTasks,
  handleUpdateTask,
  handleDeleteTask,
  handleMarkTaskAsDone,
  handleMarkTaskNotDone,
  handleGetTaskById,
  handleGetTaskViewCount,
  handleIncreaseTaskViewCount,
  handleShareTaskProgress,
} from "./task.controller";
import { requireAuth } from "../../middleware/requireAuth";
import { optionalAuth } from "../../middleware/optionalAuth"; // FIXED path

const router = Router();

// ---------------------------
// CREATE (Auth required)
// ---------------------------
router.post("/", requireAuth, handleCreateTask);

// ---------------------------
// GET ALL TASKS (public feed)
// ---------------------------
router.get("/", optionalAuth, handleGetTasks);

// ---------------------------
// GET ONE TASK (public)
// ---------------------------
router.get("/:id", optionalAuth, handleGetTaskById);

// ---------------------------
// UPDATE + DELETE (Auth required)
// ---------------------------
router.patch("/:id", requireAuth, handleUpdateTask);
router.delete("/:id", requireAuth, handleDeleteTask);

// ---------------------------
// COMPLETE / INCOMPLETE (Auth required)
// ---------------------------
router.patch("/:id/complete", requireAuth, handleMarkTaskAsDone);
router.patch("/:id/incomplete", requireAuth, handleMarkTaskNotDone);
router.post("/:id/progress", requireAuth, handleShareTaskProgress);


// ---------------------------
// get TASK VIEW COUNT (public)
// ---------------------------
router.get("/:id/views", optionalAuth, handleGetTaskViewCount);
router.post("/:id/views", optionalAuth, handleIncreaseTaskViewCount);
export default router;
