import { Request, Response, NextFunction } from "express";
import {
  createTask,
  deleteTask,
  getAllTasks,
  getTaskById,
  getTaskViewCount,
  increaseTaskViewCount,
  markTaskAsDone,
  markTaskAsNotDone,
  updateTask,
} from "./task.service";
import { BadRequestError } from "../../errors";
import { CreateTaskInput } from "./task.types";
import { taskSchema, taskUpdateSchema } from "./task.schema";
import { ZodError } from "zod";

/* -------------------------------------------------------
   CREATE TASK (AUTH REQUIRED)
---------------------------------------------------------*/
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
    const parsed = taskSchema.parse(req.body);

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

    next(error);
  }
}

/* -------------------------------------------------------
   UPDATE TASK (AUTH REQUIRED)
---------------------------------------------------------*/
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

/* -------------------------------------------------------
   GET ALL TASKS (OPTIONAL AUTH → PUBLIC FEED)
---------------------------------------------------------*/
export async function handleGetTasks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // OPTIONAL — userId may be null
    const userId = req.user?.id ?? null;

    const parsedLimit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : undefined;

    const limit =
      typeof parsedLimit === "number" && !Number.isNaN(parsedLimit)
        ? parsedLimit
        : undefined;

    const cursorQuery =
      typeof req.query.cursor === "string" && req.query.cursor.trim().length > 0
        ? req.query.cursor.trim()
        : undefined;

    const excludeSelf = req.query.excludeSelf === "true";

    const paginated = await getAllTasks(userId, {
      limit,
      cursor: cursorQuery,
      excludeSelf,
    });

    res.status(200).json({
      data: paginated.tasks,
      meta: {
        hasMore: paginated.hasMore,
        nextCursor: paginated.nextCursor,
      },
    });
  } catch (error) {
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
export async function handleGetTaskById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?.id ?? null;

    const task = await getTaskById(id, userId);

    // ❌ Your old version did NOT return after sending 404 → bug
    if (!task) {
       res.status(404).json({ error: "Task not found" });
    }

     res.status(200).json(task);
  } catch (error) {
    console.error("[TASK_FETCH_BY_ID_ERROR]", error);
    next(error);
  }
}

/* -------------------------------------------------------
   DELETE TASK (AUTH REQUIRED)
---------------------------------------------------------*/
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
    next(error);
  }
}

/* -------------------------------------------------------
   MARK TASK AS DONE (AUTH REQUIRED)
---------------------------------------------------------*/
export async function handleMarkTaskAsDone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const taskId = req.params.id;
  const userId = req.user?.id;

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

/* -------------------------------------------------------
   MARK TASK AS NOT DONE (AUTH REQUIRED)
---------------------------------------------------------*/
export async function handleMarkTaskNotDone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const taskId = req.params.id;
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }

  try {
    const updated = await markTaskAsNotDone(taskId, userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("[TASK_NOT_DONE_ERROR]", error);
    next(error);
  }
}



export async function handleGetTaskViewCount(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const viewCount = await getTaskViewCount(id);

    if (viewCount === null) {
       res.status(404).json({ error: "Task not found" });
    }

    res.json({ viewCount });
  } catch (err) {
    next(err);
  }
}

export async function handleIncreaseTaskViewCount(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    await increaseTaskViewCount(id);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
