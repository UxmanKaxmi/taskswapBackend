import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/client";
import { USER_ORIGIN } from "../features/seededUser/seededUser.service";
import { touchUserActivity } from "../utils/touchUserActivity";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, origin: true },
    });

    if (!user || user.origin === USER_ORIGIN.SEEDED) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // ✅ Set as req.user for consistent usage
    req.user = { id: user.id };
    void touchUserActivity(user.id);
    console.log("✅ JWT token:", token);
    console.log("✅ Decoded token:", decoded);
    console.log("✅ req.user:", req.user);

    next();
  } catch (err) {
    console.error("[JWT ERROR]", err);
    res.status(401).json({ error: "Invalid token" });
  }
};
