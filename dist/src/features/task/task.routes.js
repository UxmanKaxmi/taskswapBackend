"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const task_controller_1 = require("./task.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const optionalAuth_1 = require("../../middleware/optionalAuth"); // FIXED path
const router = (0, express_1.Router)();
// ---------------------------
// CREATE (Auth required)
// ---------------------------
router.post("/", requireAuth_1.requireAuth, task_controller_1.handleCreateTask);
// ---------------------------
// GET ALL TASKS (public feed)
// ---------------------------
router.get("/", optionalAuth_1.optionalAuth, task_controller_1.handleGetTasks);
// ---------------------------
// GET ONE TASK (public)
// ---------------------------
router.get("/:id", optionalAuth_1.optionalAuth, task_controller_1.handleGetTaskById);
// ---------------------------
// UPDATE + DELETE (Auth required)
// ---------------------------
router.patch("/:id", requireAuth_1.requireAuth, task_controller_1.handleUpdateTask);
router.delete("/:id", requireAuth_1.requireAuth, task_controller_1.handleDeleteTask);
// ---------------------------
// COMPLETE / INCOMPLETE (Auth required)
// ---------------------------
router.patch("/:id/complete", requireAuth_1.requireAuth, task_controller_1.handleMarkTaskAsDone);
router.patch("/:id/incomplete", requireAuth_1.requireAuth, task_controller_1.handleMarkTaskNotDone);
// Reveal an anonymous goal (one-way: anon → named)
router.post("/:id/reveal", requireAuth_1.requireAuth, task_controller_1.handleRevealTask);
router.post("/:id/progress", requireAuth_1.requireAuth, task_controller_1.handleShareTaskProgress);
// ---------------------------
// get TASK VIEW COUNT (public)
// ---------------------------
router.get("/:id/views", optionalAuth_1.optionalAuth, task_controller_1.handleGetTaskViewCount);
router.post("/:id/views", optionalAuth_1.optionalAuth, task_controller_1.handleIncreaseTaskViewCount);
exports.default = router;
