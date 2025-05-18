// src/middleware/errorHandler.ts
import { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

/**
 * 🔖 Common HTTP Status Codes for AppError
 *
 * 400 - Bad Request
 *    → Invalid or missing data sent by client
 *
 * 401 - Unauthorized
 *    → User is not logged in or token is invalid
 *
 * 403 - Forbidden
 *    → Logged-in user does not have permission
 *
 * 404 - Not Found
 *    → Requested resource (e.g. task/user) doesn’t exist
 *
 * 409 - Conflict
 *    → Duplicate entry or state conflict (e.g. task already exists)
 *
 * 422 - Unprocessable Entity
 *    → Semantic validation error (e.g. invalid enum, logic failure)
 *
 * 500 - Internal Server Error
 *    → Unexpected server failure (don't expose details to client)
 */

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
