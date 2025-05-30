import { Request, Response, NextFunction } from "express";
import {
  createTask,
  deleteTask,
  getAllTasks,
  markTaskAsDone,
  markTaskAsNotDone,
  updateTask,
} from "./task.service";
import { BadRequestError } from "../../errors";
import {
  CreateTaskInput,
  TaskType,
  ReminderTaskType,
  DecisionTaskType,
  MotivationTaskType,
  AdviceTaskType,
} from "./task.types";
import { taskSchema, taskUpdateSchema } from "./task.schema";
import { ZodError } from "zod";

export async function handleCreateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }

  try {
    const parsed = taskSchema.parse(req.body); // Validated and type-safe

    console.log("parsed", parsed);
    const taskInput: CreateTaskInput = {
      ...parsed,
      userId,
    };

    const task = await createTask(taskInput);
    res.status(201).json(task);
  } catch (error) {
    console.error("[TASK_CREATE_ERROR]", error);

    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.errors,
      });
    }

    next(error); // Only call this if it’s not a Zod error
  }
}

export async function handleUpdateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id } = req.params;

  try {
    const parsed = taskUpdateSchema.parse(req.body);

    if (Object.keys(parsed).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await updateTask(id, parsed);
    res.status(200).json(updated);
  } catch (error) {
    console.error("[TASK_UPDATE_ERROR]", error);

    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.errors,
      });
    }

    next(error);
  }
}

export async function handleGetTasks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }

  try {
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : undefined;
    const excludeSelf = req.query.excludeSelf === "true"; // default false if not set

    const tasks = await getAllTasks(userId, { limit, excludeSelf });
    res.status(200).json(tasks);
  } catch (error) {
    console.error("[TASK_FETCH_ERROR]", error);
    next(error);
  }
}

export async function handleDeleteTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id } = req.params;

  try {
    await deleteTask(id);
    res.status(204).send();
  } catch (error: any) {
    if (error instanceof Error && error.message === "Task not found.") {
      res.status(404).json({ error: "Task not found" });
    }

    console.error("[TASK_DELETE_ERROR]", error);
    next(error); // Let errorHandler.ts figure out the response
  }
}

export async function handleMarkTaskAsDone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  console.log("PATCH /tasks/:id/complete hit with ID:", req.params.id);
  const taskId = req.params.id;
  const userId = req.user?.id;
  console.log("[PATCH TASK] incoming task ID:", req.params.id);
  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }

  try {
    const updated = await markTaskAsDone(taskId, userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("[TASK_COMPLETE_ERROR]", error);
    next(error);
  }
}

export async function handleMarkTaskNotDone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const taskId = req.params.id;
  const userId = req.user?.id;
  console.log("[PATCH TASK] incoming task ID:", req.params.id);
  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }

  try {
    const updated = await markTaskAsNotDone(taskId, userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("[TASK_COMPLETE_ERROR]", error);
    next(error);
  }
}
