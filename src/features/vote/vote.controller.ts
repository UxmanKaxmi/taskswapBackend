import { Request, Response, NextFunction } from "express";
import { castVoteForTask, getVotesForTask } from "./vote.service";
import { getParamString } from "../../utils/params";

// POST /tasks/:id/vote
export async function castVote(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const taskId = getParamString(req.params.id);

    // Accept both legacy { option } and new { nextOption, prevOption }
    const { nextOption, prevOption, option } = (req.body ?? {}) as {
      nextOption?: string;
      prevOption?: string;
      option?: string; // legacy
    };

    const chosen = (nextOption ?? option)?.trim();

    if (!taskId) {
      res.status(400).json({ message: "Missing taskId" });
      return;
    }
    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }
    if (!chosen) {
      res.status(400).json({ message: "nextOption is required" });
      return;
    }

    const result = await castVoteForTask({
      userId: userId as string,
      taskId: taskId as string,
      nextOption: chosen,
      prevOption, // optional
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// GET /tasks/:id/votes
export async function getVotes(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const taskId = getParamString(req.params.id);
    if (!taskId) {
      res.status(400).json({ message: "Missing taskId" });
      return;
    }

    const results = await getVotesForTask(taskId);
    res.status(200).json(results);
  } catch (error) {
    next(error);
  }
}

// (Optional) Test or dev route
export async function handleGetVote(_req: Request, res: Response) {
  res.status(200).json({ message: "✅ Vote route is working" });
}
