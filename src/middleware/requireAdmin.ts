import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";

export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const userId = req.user?.id;
  const adminIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!userId) {
    return next(new AppError("Unauthorized", 401));
  }

  if (!adminIds.includes(userId)) {
    return next(new AppError("Forbidden", 403));
  }

  return next();
};
