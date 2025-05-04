import { Request, Response } from "express";
import { createTask, getAllTasks } from "./task.service";

export async function handleCreateTask(
  req: Request,
  res: Response
): Promise<void> {
  const { text, type } = req.body;
  const userId = req.userId; // ✅ from JWT via middleware

  if (!text || !type || !userId) {
    res.status(400).json({ error: "Missing task text, type, or user" });
    return;
  }

  try {
    const task = await createTask({ text, type, userId });
    res.status(201).json(task);
  } catch (error: any) {
    if (error.message.includes("already created")) {
      res.status(409).json({ error: error.message }); // Conflict
    } else {
      res.status(500).json({ error: "Failed to create task" });
    }
  }
}

export async function handleGetTasks(_req: Request, res: Response) {
  try {
    console.log("[INFO] Fetching all tasks", _req, res);
    const tasks = await getAllTasks();
    res.status(200).json(tasks);
  } catch (error) {
    console.error("[TASK_FETCH_ERROR]", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
}
