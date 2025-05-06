import { Router } from "express";
import {
  handleCreateTask,
  handleGetTasks,
  handleUpdateTask,
  handleDeleteTask,
} from "./task.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/", requireAuth, handleCreateTask);
router.get("/", requireAuth, handleGetTasks);
router.put("/:id", requireAuth, handleUpdateTask);
router.delete("/:id", requireAuth, handleDeleteTask);

export default router;
