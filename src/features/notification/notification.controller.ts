import { Request, Response, NextFunction } from "express";
import { getParamString } from "../../utils/params";
import {
  getUserNotifications,
  markNotificationAsRead,
  markNotificationsAsRead,
  sendSilentNotificationToUser,
  sendTestNotification,
} from "./notification.service";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";

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

// Separate API for silent (data-only) pushes. Sends to the authenticated user
// only (self), so it can't be used to spam others. Defaults to a
// push-received payload so an empty body still renders the "X pushed you" pill.
export async function handleSendSilentNotification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const { data } = req.body;
    const overrides =
      data && typeof data === "object" && !Array.isArray(data)
        ? Object.fromEntries(
            Object.entries(data)
              .filter(
                ([, value]) => typeof value === "string" || typeof value === "number"
              )
              .map(([key, value]) => [key, String(value)])
          )
        : {};

    const sent = await sendSilentNotificationToUser(userId, {
      notificationType: NOTIFICATION_TYPES.TASK_MOTIVATION_PUSH,
      pusherName: "Sara",
      ...overrides,
    });

    res.status(200).json({
      sent,
      message: sent
        ? "Silent notification sent"
        : "No FCM token registered for this user",
    });
  } catch (error) {
    console.error("❌ Failed to send silent notification:", error);
    next(error);
  }
}
