// src/features/reminderNote/reminderNote.routes.ts

import { Router } from "express";
import {
  handleGetRemindersByTask,
  handleSendReminderNote,
} from "./reminderNote.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

router.post("/:id/remind", requireAuth, handleSendReminderNote);
router.get("/:id/reminders", requireAuth, handleGetRemindersByTask);

export default router;
