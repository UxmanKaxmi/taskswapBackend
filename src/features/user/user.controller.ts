import { Request, Response, NextFunction } from "express";
import { syncUserToDB } from "./user.service";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";
import { BadRequestError } from "../../errors";
import { AppError } from "../../errors/AppError";

export async function handleSyncUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id, email, name, photo } = req.body;

  if (!id || !email || !name) {
    return next(new BadRequestError("Missing required user fields"));
  }

  try {
    const user: User = await syncUserToDB({ id, email, name, photo });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.status(200).json({ user, token });
  } catch (error) {
    console.error("[USER_API_ERROR]", error);
    next(new AppError("Failed to sync user", 500));
  }
}
