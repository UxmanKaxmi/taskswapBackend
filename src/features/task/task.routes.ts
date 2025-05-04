import { Router } from "express";
import { handleCreateTask, handleGetTasks } from "./task.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/", requireAuth, handleCreateTask);
router.get("/", requireAuth, handleGetTasks);

export default router;
