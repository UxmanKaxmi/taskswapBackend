import { Request, Response, NextFunction } from "express";
import { castVoteForTask, getVotesForTask } from "./vote.service";

// POST /tasks/:id/vote
export async function castVote(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const taskId = req.params.id;

    // Accept both legacy { option } and new { nextOption, prevOption }
    const { nextOption, prevOption, option } = (req.body ?? {}) as {
      nextOption?: string;
      prevOption?: string;
      option?: string; // legacy
    };

    const chosen = (nextOption ?? option)?.trim();

    if (!taskId) {
      return res.status(400).json({ message: "Missing taskId" });
    }
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }
    if (!chosen) {
      return res.status(400).json({ message: "nextOption is required" });
    }

    const result = await castVoteForTask({
      userId,
      taskId,
      nextOption: chosen,
      prevOption, // optional
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

// GET /tasks/:id/votes
export async function getVotes(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      return res.status(400).json({ message: "Missing taskId" });
    }

    const results = await getVotesForTask(taskId);
    return res.status(200).json(results);
  } catch (error) {
    return next(error);
  }
}

// (Optional) Test or dev route
export async function handleGetVote(_req: Request, res: Response) {
  return res.status(200).json({ message: "✅ Vote route is working" });
}
