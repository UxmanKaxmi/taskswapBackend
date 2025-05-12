import { Request, Response, NextFunction } from "express";
import {
  createTask,
  deleteTask,
  getAllTasks,
  updateTask,
} from "./task.service";
import { BadRequestError } from "../../errors";
import { AppError } from "../../errors/AppError";

export async function handleCreateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { text, type, remindAt, options, deliverAt } = req.body;
  const userId = req.userId; // ✅ added via custom middleware

  if (!text || !type || !userId) {
    return next(new BadRequestError("Missing task text, type, or user ID"));
  }

  // Validate task type specific fields
  switch (type) {
    case "reminder":
      if (!remindAt)
        return next(new BadRequestError("Missing remindAt for reminder task"));
      break;
    case "decision":
      if (!options || !Array.isArray(options) || options.length < 2) {
        return next(
          new BadRequestError("Decision tasks must have at least two options")
        );
      }
      break;
    case "motivation":
      // deliverAt is optional
      break;
    case "advice":
      // No special fields for advice
      break;
    default:
      return next(new BadRequestError("Invalid task type"));
  }

  try {
    const task = await createTask({
      text,
      type,
      remindAt,
      options,
      deliverAt,
      userId,
    });
    res.status(201).json(task);
  } catch (error) {
    console.error("[TASK_CREATE_ERROR]", error);
    next(new AppError("Failed to create task", 500));
  }
}

export async function handleGetTasks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;

  try {
    if (!userId) {
      return next(new BadRequestError("User ID is required"));
    }
    const tasks = await getAllTasks(userId); // Only user-specific tasks
    res.status(200).json(tasks);
  } catch (error) {
    console.error("[TASK_FETCH_ERROR]", error);
    next(new AppError("Failed to fetch tasks", 500));
  }
}

export async function handleUpdateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id } = req.params;
  const { text, type, remindAt, options, deliverAt } = req.body;

  if (!text && !type && !remindAt && !options && !deliverAt) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  try {
    const updated = await updateTask(id, {
      text,
      type,
      remindAt,
      options,
      deliverAt,
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error("[TASK_UPDATE_ERROR]", error);
    next(new AppError("Failed to update task", 500));
  }
}

export async function handleDeleteTask(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;

  try {
    await deleteTask(id);
    res.status(204).send(); // ✅ No return
  } catch (error: any) {
    if (error instanceof Error && error.message === "Task not found.") {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    console.error("[TASK_DELETE_ERROR]", error);
    next(new AppError("Failed to delete task", 500));
  }
}
