// src/middleware/errorHandler.ts
import { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  console.error("❌ [Global Error]", err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        res.status(409).json({ error: "Duplicate entry" });
        return;
      case "P2025":
        res.status(404).json({ error: "Record not found" });
        return;
      default:
        res.status(500).json({ error: `Database error [${err.code}]` });
        return;
    }
  }

  res.status(500).json({ error: "Something went wrong" });
  return;
};
