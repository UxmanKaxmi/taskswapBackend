import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { USER_ORIGIN } from "../features/seededUser/seededUser.service";
import { touchUserActivity } from "../utils/touchUserActivity";

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
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

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, origin: true },
    });

    req.user = user && user.origin !== USER_ORIGIN.SEEDED ? { id: user.id } : undefined;
    if (req.user) {
      void touchUserActivity(req.user.id);
    }
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError || err instanceof jwt.JsonWebTokenError) {
      req.user = undefined;
      return next();
    }

    console.warn("[OPTIONAL AUTH ERROR]", err instanceof Error ? err.message : err);

    // ------------------------------------------
    // 3) Invalid token → still allow the request
    // ------------------------------------------
    req.user = undefined;
  }

  next();
};
