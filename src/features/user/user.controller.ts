import { Request, Response } from "express";
import { syncUserToDB } from "./user.service";
import jwt from "jsonwebtoken";
import { User } from "@prisma/client";

export async function handleSyncUser(
  req: Request,
  res: Response
): Promise<void> {
  const { id, email, name, photo } = req.body;

  if (!id || !email || !name) {
    res.status(400).json({ error: "Missing required user fields" });
    return;
  }

  try {
    const user: User = await syncUserToDB({ id, email, name, photo });
    // ✅ Create JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.status(200).json({ user, token });
  } catch (error) {
    console.error("[USER_API_ERROR]", error);
    res.status(500).json({ error: "Failed to save user" });
  }
}
