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
} from "../../types/task.types";

export async function handleCreateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;
  const { type, text, remindAt, options, deliverAt, avatar } = req.body;

  if (!userId || !text || !type) {
    return next(new BadRequestError("Missing task text, type, or user ID"));
  }

  let taskInput: CreateTaskInput;

  try {
    switch (type as TaskType) {
      case "reminder":
        if (!remindAt) {
          throw new BadRequestError("Missing remindAt for reminder task");
        }
        taskInput = {
          type,
          text,
          userId,
          remindAt,
          avatar,
        } satisfies ReminderTaskType;
        break;

      case "decision":
        if (!options || !Array.isArray(options) || options.length < 2) {
          throw new BadRequestError(
            "Decision tasks must have at least two options"
          );
        }
        taskInput = {
          type,
          text,
          userId,
          options,
          avatar,
        } satisfies DecisionTaskType;
        break;

      case "motivation":
        taskInput = {
          type,
          text,
          userId,
          deliverAt,
          avatar,
        } satisfies MotivationTaskType;
        break;

      case "advice":
        taskInput = { type, text, userId, avatar } satisfies AdviceTaskType;
        break;

      default:
        throw new BadRequestError("Invalid task type");
    }

    const task = await createTask(taskInput);
    res.status(201).json(task);
  } catch (error) {
    console.error("[TASK_CREATE_ERROR]", error);
    next(error); // Let errorHandler.ts figure out the response
  }
}

export async function handleGetTasks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }

  try {
    const tasks = await getAllTasks(userId);
    res.status(200).json(tasks);
  } catch (error) {
    console.error("[TASK_FETCH_ERROR]", error);
    next(error); // Let errorHandler.ts figure out the response
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
  const userId = req.userId;
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
  const userId = req.userId;
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
