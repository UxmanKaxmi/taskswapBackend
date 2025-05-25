"use strict";
// src/features/reminderNote/reminderNote.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reminderNote_controller_1 = require("./reminderNote.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const router = (0, express_1.Router)();
router.post("/:id/remind", requireAuth_1.requireAuth, reminderNote_controller_1.handleSendReminderNote);
router.get("/:id/reminders", requireAuth_1.requireAuth, reminderNote_controller_1.handleGetRemindersByTask);
exports.default = router;
