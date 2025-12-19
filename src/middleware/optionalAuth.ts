import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  // ------------------------------------------
  // 1) No token → treat as guest
  // ------------------------------------------
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = undefined; 
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    // ------------------------------------------
    // 2) Verify token (same logic as requireAuth)
    // ------------------------------------------
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };

    req.user = { id: decoded.userId };
  } catch (err) {
    console.error("[OPTIONAL AUTH ERROR]", err);

    // ------------------------------------------
    // 3) Invalid token → still allow the request
    // ------------------------------------------
    req.user = undefined;
  }

  next();
};