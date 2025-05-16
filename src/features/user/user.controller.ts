import { Request, Response, NextFunction } from "express";
import { matchUsersByEmail, syncUserToDB } from "./user.service";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";
import { BadRequestError } from "../../errors";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/client";

export async function handleSyncUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id, email, name, photo } = req.body;

  console.log("[HANDLE_SYNC_USER] Request body:", req.body);

  if (!id || !email || !name) {
    console.log("[HANDLE_SYNC_USER] Missing required user fields");
    return next(new BadRequestError("Missing required user fields"));
  }

  try {
    const user: User = await syncUserToDB({ id, email, name, photo });

    console.log("[HANDLE_SYNC_USER] User synced to DB:", user);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    console.log("[HANDLE_SYNC_USER] JWT token generated");

    res.status(200).json({ user, token });
  } catch (error) {
    console.error("[USER_API_ERROR]", error);
    next(new AppError("Failed to sync user", 500));
  }
}

export async function handleMatchUsers(
  req: Request<{}, {}, { emails: string[] }>,
  res: Response,
  next: NextFunction
) {
  const { emails } = req.body;
  if (!Array.isArray(emails)) {
    return next(new AppError("`emails` must be an array", 400));
  }

  try {
    const users = await matchUsersByEmail(emails);
    res.json(users);
  } catch (err) {
    next(new AppError("Failed to match users", 500));
  }
}
