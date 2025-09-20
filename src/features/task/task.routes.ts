import { Router } from "express";
import {
  handleCreateTask,
  handleGetTasks,
  handleUpdateTask,
  handleDeleteTask,
  handleMarkTaskAsDone,
  handleMarkTaskNotDone,
  handleGetTaskById,
} from "./task.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/", requireAuth, handleCreateTask);
router.get("/", requireAuth, handleGetTasks);
router.get("/:id", requireAuth, handleGetTaskById);
router.patch("/:id", requireAuth, handleUpdateTask);
router.delete("/:id", requireAuth, handleDeleteTask);

router.patch("/:id/complete", requireAuth, handleMarkTaskAsDone);
router.patch("/:id/incomplete", requireAuth, handleMarkTaskNotDone);

export default router;
