"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reminderNote_controller_1 = require("./reminderNote.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const optionalAuth_1 = require("../../middleware/optionalAuth");
const router = (0, express_1.Router)();
// Send reminder → user must be logged in
router.post("/:id/remind", requireAuth_1.requireAuth, reminderNote_controller_1.handleSendReminderNote);
// Fetch reminders → PUBLIC (optional auth)
router.get("/:id/reminders", optionalAuth_1.optionalAuth, reminderNote_controller_1.handleGetRemindersByTask);
exports.default = router;
