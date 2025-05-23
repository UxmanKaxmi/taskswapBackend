import { Request, Response, NextFunction } from "express";
import {
  getUserNotifications,
  markNotificationAsRead,
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
