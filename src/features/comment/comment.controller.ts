import { Request, Response, NextFunction } from "express";
import {
  createComment,
  getCommentsForTask,
  toggleCommentLike,
} from "./comment.service";
import { createCommentSchema } from "./comment.schema";
import { BadRequestError } from "../../errors";

export async function handleCreateComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  try {
    const parsed = createCommentSchema.parse(req.body);
    const comment = await createComment({ ...parsed, userId });
    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
}

export async function handleGetComments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  const { taskId } = req.params;
  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  try {
    const comments = await getCommentsForTask(taskId, userId);
    res.status(200).json(comments);
  } catch (error) {
    next(error);
  }
}

export async function handleToggleLike(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }
  try {
    const { commentId, like } = req.body;
    await toggleCommentLike(commentId, userId, like);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}
