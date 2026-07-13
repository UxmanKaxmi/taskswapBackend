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
  revealTask,
  shareTaskProgress,
  updateTask,
} from "./task.service";
import { BadRequestError } from "../../errors";
import { CreateTaskInput, FeedSort } from "./task.types";
import {
  taskProgressUpdateSchema,
  taskSchema,
  taskUpdateSchema,
} from "./task.schema";
import { ZodError } from "zod";
import { getParamString } from "../../utils/params";

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
  const id = getParamString(req.params.id);
  const userId = req.user?.id;

  try {
    if (!userId) {
      return next(new BadRequestError("User ID is required"));
    }
    if (!id) {
      res.status(400).json({ error: "Missing task id" });
      return;
    }
    const parsed = taskUpdateSchema.parse(req.body);

    if (Object.keys(parsed).length === 0) {
       res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await updateTask(id, parsed, userId);
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
    const includeCircles =
      req.query.includeCircles === "1" || req.query.includeCircles === "true";
    const sort =
      typeof req.query.sort === "string" && req.query.sort.trim().length > 0
        ? req.query.sort.trim()
        : undefined;

    const paginated = await getAllTasks(userId, {
      limit,
      cursor: cursorQuery,
      excludeSelf,
      sort: sort as FeedSort | undefined,
      includeCircles,
    });

    res.status(200).json({
      data: paginated.tasks,
      ...(paginated.circles ? { circles: paginated.circles } : {}),
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
    const id = getParamString(req.params.id);
    const userId = req.user?.id ?? null;

    if (!id) {
      res.status(400).json({ error: "Missing task id" });
      return;
    }

    const task = await getTaskById(id, userId);

    // ❌ Your old version did NOT return after sending 404 → bug
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
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
  const id = getParamString(req.params.id);
  const userId = req.user?.id;

  try {
    if (!userId) {
      return next(new BadRequestError("User ID is required"));
    }
    if (!id) {
      res.status(400).json({ error: "Missing task id" });
      return;
    }
    await deleteTask(id, userId);
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
  const taskId = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  if (!taskId) {
    return next(new BadRequestError("Task ID is required"));
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
   REVEAL ANONYMOUS TASK (AUTH REQUIRED, one-way)
---------------------------------------------------------*/
export async function handleRevealTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const taskId = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  if (!taskId) {
    return next(new BadRequestError("Task ID is required"));
  }

  try {
    const revealed = await revealTask(taskId, userId);
    res.status(200).json(revealed);
  } catch (error) {
    console.error("[TASK_REVEAL_ERROR]", error);
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
  const taskId = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  if (!taskId) {
    return next(new BadRequestError("Task ID is required"));
  }

  try {
    const updated = await markTaskAsNotDone(taskId, userId);
    res.status(200).json(updated);
  } catch (error) {
    console.error("[TASK_NOT_DONE_ERROR]", error);
    next(error);
  }
}

/* -------------------------------------------------------
   SHARE PROGRESS UPDATE (AUTH REQUIRED)
---------------------------------------------------------*/
export async function handleShareTaskProgress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const taskId = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  if (!taskId) {
    return next(new BadRequestError("Task ID is required"));
  }

  try {
    const parsed = taskProgressUpdateSchema.parse(req.body);
    const progressUpdate = await shareTaskProgress(taskId, userId, parsed.text);
    res.status(201).json({
      progressUpdates: [progressUpdate],
    });
  } catch (error) {
    console.error("[TASK_PROGRESS_UPDATE_ERROR]", error);

    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.errors,
      });
    }

    next(error);
  }
}



export async function handleGetTaskViewCount(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = getParamString(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Missing task id" });
      return;
    }
    const viewCount = await getTaskViewCount(id);

    if (viewCount === null) {
      res.status(404).json({ error: "Task not found" });
      return;
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
    const id = getParamString(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Missing task id" });
      return;
    }
    await increaseTaskViewCount(id);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
