"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateTask = handleCreateTask;
exports.handleUpdateTask = handleUpdateTask;
exports.handleGetTasks = handleGetTasks;
exports.handleGetTaskById = handleGetTaskById;
exports.handleDeleteTask = handleDeleteTask;
exports.handleMarkTaskAsDone = handleMarkTaskAsDone;
exports.handleMarkTaskNotDone = handleMarkTaskNotDone;
exports.handleGetTaskViewCount = handleGetTaskViewCount;
exports.handleIncreaseTaskViewCount = handleIncreaseTaskViewCount;
const task_service_1 = require("./task.service");
const errors_1 = require("../../errors");
const task_schema_1 = require("./task.schema");
const zod_1 = require("zod");
/* -------------------------------------------------------
   CREATE TASK (AUTH REQUIRED)
---------------------------------------------------------*/
async function handleCreateTask(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is missing"));
    }
    try {
        const parsed = task_schema_1.taskSchema.parse(req.body);
        const taskInput = {
            ...parsed,
            userId,
        };
        const task = await (0, task_service_1.createTask)(taskInput);
        res.status(201).json(task);
    }
    catch (error) {
        console.error("[TASK_CREATE_ERROR]", error);
        if (error instanceof zod_1.ZodError) {
            res.status(400).json({
                error: "Validation error",
                issues: error.errors,
            });
        }
        next(error);
    }
}
/* -------------------------------------------------------
   UPDATE TASK (AUTH REQUIRED)
---------------------------------------------------------*/
async function handleUpdateTask(req, res, next) {
    const { id } = req.params;
    try {
        const parsed = task_schema_1.taskUpdateSchema.parse(req.body);
        if (Object.keys(parsed).length === 0) {
            res.status(400).json({ error: "Nothing to update" });
        }
        const updated = await (0, task_service_1.updateTask)(id, parsed);
        res.status(200).json(updated);
    }
    catch (error) {
        console.error("[TASK_UPDATE_ERROR]", error);
        if (error instanceof zod_1.ZodError) {
            res.status(400).json({
                error: "Validation error",
                issues: error.errors,
            });
        }
        next(error);
    }
}
/* -------------------------------------------------------
   GET ALL TASKS (OPTIONAL AUTH → PUBLIC FEED)
---------------------------------------------------------*/
async function handleGetTasks(req, res, next) {
    try {
        // OPTIONAL — userId may be null
        const userId = req.user?.id ?? null;
        const limit = req.query.limit
            ? parseInt(req.query.limit, 10)
            : undefined;
        const excludeSelf = req.query.excludeSelf === "true";
        const tasks = await (0, task_service_1.getAllTasks)(userId, { limit, excludeSelf });
        res.status(200).json(tasks);
    }
    catch (error) {
        console.error("[TASK_FETCH_ERROR]", error);
        next(error);
    }
}
/* -------------------------------------------------------
   GET SINGLE TASK (OPTIONAL AUTH → PUBLIC POST VIEW)
---------------------------------------------------------*/
/* -------------------------------------------------------
   GET ONE TASK (public)
---------------------------------------------------------*/
async function handleGetTaskById(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.user?.id ?? null;
        const task = await (0, task_service_1.getTaskById)(id, userId);
        // ❌ Your old version did NOT return after sending 404 → bug
        if (!task) {
            res.status(404).json({ error: "Task not found" });
        }
        res.status(200).json(task);
    }
    catch (error) {
        console.error("[TASK_FETCH_BY_ID_ERROR]", error);
        next(error);
    }
}
/* -------------------------------------------------------
   DELETE TASK (AUTH REQUIRED)
---------------------------------------------------------*/
async function handleDeleteTask(req, res, next) {
    const { id } = req.params;
    try {
        await (0, task_service_1.deleteTask)(id);
        res.status(204).send();
    }
    catch (error) {
        if (error instanceof Error && error.message === "Task not found.") {
            res.status(404).json({ error: "Task not found" });
        }
        console.error("[TASK_DELETE_ERROR]", error);
        next(error);
    }
}
/* -------------------------------------------------------
   MARK TASK AS DONE (AUTH REQUIRED)
---------------------------------------------------------*/
async function handleMarkTaskAsDone(req, res, next) {
    const taskId = req.params.id;
    const userId = req.user?.id;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const updated = await (0, task_service_1.markTaskAsDone)(taskId, userId);
        res.status(200).json(updated);
    }
    catch (error) {
        console.error("[TASK_COMPLETE_ERROR]", error);
        next(error);
    }
}
/* -------------------------------------------------------
   MARK TASK AS NOT DONE (AUTH REQUIRED)
---------------------------------------------------------*/
async function handleMarkTaskNotDone(req, res, next) {
    const taskId = req.params.id;
    const userId = req.user?.id;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const updated = await (0, task_service_1.markTaskAsNotDone)(taskId, userId);
        res.status(200).json(updated);
    }
    catch (error) {
        console.error("[TASK_NOT_DONE_ERROR]", error);
        next(error);
    }
}
async function handleGetTaskViewCount(req, res, next) {
    try {
        const { id } = req.params;
        const viewCount = await (0, task_service_1.getTaskViewCount)(id);
        if (viewCount === null) {
            res.status(404).json({ error: "Task not found" });
        }
        res.json({ viewCount });
    }
    catch (err) {
        next(err);
    }
}
async function handleIncreaseTaskViewCount(req, res, next) {
    try {
        const { id } = req.params;
        await (0, task_service_1.increaseTaskViewCount)(id);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
