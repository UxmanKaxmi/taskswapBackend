import { Request, Response, NextFunction } from "express";
import {
  getUserNotifications,
  markNotificationAsRead,
  sendTestNotification,
} from "./notification.service";

export async function handleGetNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.userId;
    const notifications = await getUserNotifications(userId);
    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
}

export async function handleMarkNotificationAsRead(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const notificationId = req.params.id;
    const result = await markNotificationAsRead(notificationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleTestSendNotification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      userId,
      title = "Test Notification",
      body = "🚀 This is a test.",
    } = req.body;
    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }

    await sendTestNotification(userId, title, body);
    res.status(200).json({ message: "Notification sent successfully" });
  } catch (error) {
    console.error("❌ Failed to send test notification:", error);
    next(error);
  }
}
