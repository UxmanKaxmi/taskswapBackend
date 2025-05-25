"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateTask = handleCreateTask;
exports.handleGetTasks = handleGetTasks;
exports.handleUpdateTask = handleUpdateTask;
exports.handleDeleteTask = handleDeleteTask;
exports.handleMarkTaskAsDone = handleMarkTaskAsDone;
exports.handleMarkTaskNotDone = handleMarkTaskNotDone;
const task_service_1 = require("./task.service");
const errors_1 = require("../../errors");
const task_schema_1 = require("./task.schema");
const zod_1 = require("zod");
async function handleCreateTask(req, res, next) {
    const userId = req.userId;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is missing"));
    }
    try {
        const parsed = task_schema_1.taskSchema.parse(req.body); // Validated and type-safe
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
async function handleGetTasks(req, res, next) {
    const userId = req.userId;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const tasks = await (0, task_service_1.getAllTasks)(userId);
        res.status(200).json(tasks);
    }
    catch (error) {
        console.error("[TASK_FETCH_ERROR]", error);
        next(error); // Let errorHandler.ts figure out the response
    }
}
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
        next(error); // Let errorHandler.ts figure out the response
    }
}
async function handleMarkTaskAsDone(req, res, next) {
    console.log("PATCH /tasks/:id/complete hit with ID:", req.params.id);
    const taskId = req.params.id;
    const userId = req.userId;
    console.log("[PATCH TASK] incoming task ID:", req.params.id);
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
async function handleMarkTaskNotDone(req, res, next) {
    const taskId = req.params.id;
    const userId = req.userId;
    console.log("[PATCH TASK] incoming task ID:", req.params.id);
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const updated = await (0, task_service_1.markTaskAsNotDone)(taskId, userId);
        res.status(200).json(updated);
    }
    catch (error) {
        console.error("[TASK_COMPLETE_ERROR]", error);
        next(error);
    }
}
