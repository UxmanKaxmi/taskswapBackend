import { Request, Response } from "express";
import { getFeedService } from "./feed.service";

export async function getFeed(req: Request, res: Response) {
  try {
    const userId = req.user?.id ?? null; // guest user → null

    const feed = await getFeedService(userId);

    res.status(200).json({ success: true, feed });
  } catch (error) {
    console.error("Feed error:", error);
    res.status(500).json({ success: false, message: "Failed to load feed" });
  }
}