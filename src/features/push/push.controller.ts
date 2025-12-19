import { Request, Response, NextFunction } from "express";
import { togglePushForTask, getPushesForTask } from "./push.service";

// POST /tasks/:id/push
export async function togglePush(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const taskId = req.params.id;

    if (!taskId) {
      res.status(400).json({ message: "Missing taskId" });
      return;
    }

    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }

    const result = await togglePushForTask({
      userId: userId as string,
      taskId: taskId as string,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// GET /tasks/:id/pushes
export async function getPushes(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const taskId = req.params.id;

    if (!taskId) {
      res.status(400).json({ message: "Missing taskId" });
      return;
    }

    const results = await getPushesForTask(taskId, req.user?.id as string);
    res.status(200).json(results);
  } catch (error) {
    next(error);
  }
}

// (Optional) Test or dev route
export async function handleGetPush(_req: Request, res: Response) {
  res.status(200).json({ message: "✅ Push route is working" });
} 