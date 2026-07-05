import { Request, Response, NextFunction } from "express";
import { getParamString } from "../../utils/params";
import {
  getUserNotifications,
  markNotificationAsRead,
  markNotificationsAsRead,
  sendTestNotification,
} from "./notification.service";

export async function handleGetNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }
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
    const userId = req.user?.id;
    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }
    const notificationId = getParamString(req.params.id);
    if (!notificationId) {
      res.status(400).json({ message: "Missing notificationId" });
      return;
    }
    const result = await markNotificationAsRead(notificationId, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// ✅ Mark multiple notifications as read
export async function handleBatchMarkNotificationsAsRead(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: "Invalid or missing 'ids' array" });
      return;
    }

    await markNotificationsAsRead(ids, userId);
    res.status(200).json({ message: "Notifications marked as read" });
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
      data,
    } = req.body;
    if (!userId) {
      res.status(400).json({ message: "Missing userId" });
      return;
    }

    const notificationData =
      data && typeof data === "object" && !Array.isArray(data)
        ? Object.fromEntries(
            Object.entries(data).filter(
              ([, value]) => typeof value === "string" || typeof value === "number"
            ).map(([key, value]) => [key, String(value)])
          )
        : undefined;

    await sendTestNotification(userId, title, body, notificationData);
    res.status(200).json({ message: "Notification sent successfully" });
  } catch (error) {
    console.error("❌ Failed to send test notification:", error);
    next(error);
  }
}
