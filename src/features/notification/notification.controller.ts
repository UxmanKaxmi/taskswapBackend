import { Request, Response, NextFunction } from "express";
import { getParamString } from "../../utils/params";
import {
  announceFeatureRelease,
  getUserNotifications,
  markNotificationAsRead,
  markNotificationsAsRead,
  sendFeatureReleasePreviewToUser,
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

function stringFromBody(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleAnnounceFeatureRelease(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const featureKey = stringFromBody(req.body.featureKey);
    const featureName = stringFromBody(req.body.featureName);
    const title = stringFromBody(req.body.title);
    const body = stringFromBody(req.body.body);
    const deeplinkPath = stringFromBody(req.body.deeplinkPath);
    const screen = stringFromBody(req.body.screen);

    if (!featureKey || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(featureKey)) {
      res.status(400).json({
        message:
          "featureKey is required and must be 2-64 chars using lowercase letters, numbers, '.', '_' or '-'",
      });
      return;
    }

    if (!featureName || featureName.length > 80) {
      res.status(400).json({ message: "featureName is required and must be 80 chars or less" });
      return;
    }

    if ((title && !body) || (!title && body)) {
      res.status(400).json({ message: "title and body must be provided together" });
      return;
    }

    const result = await announceFeatureRelease({
      featureKey,
      featureName,
      title: title || undefined,
      body: body || undefined,
      deeplinkPath: deeplinkPath || undefined,
      screen: screen || undefined,
      dryRun: req.body.dryRun === true,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handlePreviewFeatureRelease(
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

    const featureKey = stringFromBody(req.body.featureKey);
    const featureName = stringFromBody(req.body.featureName);
    const title = stringFromBody(req.body.title);
    const body = stringFromBody(req.body.body);
    const deeplinkPath = stringFromBody(req.body.deeplinkPath);
    const screen = stringFromBody(req.body.screen);

    if (!featureKey || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(featureKey)) {
      res.status(400).json({
        message:
          "featureKey is required and must be 2-64 chars using lowercase letters, numbers, '.', '_' or '-'",
      });
      return;
    }

    if (!featureName || featureName.length > 80) {
      res.status(400).json({ message: "featureName is required and must be 80 chars or less" });
      return;
    }

    if ((title && !body) || (!title && body)) {
      res.status(400).json({ message: "title and body must be provided together" });
      return;
    }

    const result = await sendFeatureReleasePreviewToUser(userId, {
      featureKey,
      featureName,
      title: title || undefined,
      body: body || undefined,
      deeplinkPath: deeplinkPath || undefined,
      screen: screen || undefined,
    });

    res.status(200).json(result);
  } catch (error) {
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
