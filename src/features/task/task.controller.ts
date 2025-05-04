import { Request, Response, NextFunction } from "express";
import { createTask, getAllTasks } from "./task.service";
import { BadRequestError } from "../../errors";
import { AppError } from "../../errors/AppError";

export async function handleCreateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { text, type } = req.body;
  const userId = req.userId; // ✅ added via custom middleware

  if (!text || !type || !userId) {
    return next(new BadRequestError("Missing task text, type, or user ID"));
  }

  try {
    const task = await createTask({ text, type, userId });
    res.status(201).json(task);
  } catch (error: any) {
    if (error.message.includes("already created")) {
      return next(new AppError(error.message, 409));
    }
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
    const tasks = await getAllTasks(); // optionally filter per user
    res.status(200).json(tasks);
  } catch (error) {
    console.error("[TASK_FETCH_ERROR]", error);
    next(new AppError("Failed to fetch tasks", 500));
  }
}
