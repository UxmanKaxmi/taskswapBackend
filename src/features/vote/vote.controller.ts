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
    const { option } = req.body;

    if (!taskId || !option) {
      res.status(400).json({ message: "Missing required fields" });
    }

    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }
    const vote = await castVoteForTask({ userId, taskId, option });
    res.status(200).json(vote);
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
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ message: "Missing taskId" });
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
