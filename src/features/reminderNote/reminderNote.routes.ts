import { Router } from "express";
import {
  handleGetRemindersByTask,
  handleSendReminderNote,
} from "./reminderNote.controller";
import { requireAuth } from "../../middleware/requireAuth";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = Router();

// Send reminder → user must be logged in
router.post("/:id/remind", requireAuth, handleSendReminderNote);

// Fetch reminders → PUBLIC (optional auth)
router.get("/:id/reminders", optionalAuth, handleGetRemindersByTask);

export default router;