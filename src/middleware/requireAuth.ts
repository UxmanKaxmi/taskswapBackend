import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  // console.log("[Token]", token);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.error("[JWT ERROR]", err);
    res.status(401).json({ error: "Invalid token" });
  }
};
