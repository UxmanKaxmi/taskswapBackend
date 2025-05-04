// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("❌ [Global Error]", err);

  // Handle custom AppError (your custom classes)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({ error: "Duplicate entry" });
      case "P2025":
        return res.status(404).json({ error: "Record not found" });
      default:
        return res.status(500).json({ error: `Database error [${err.code}]` });
    }
  }

  res.status(500).json({ error: "Something went wrong" });
}
