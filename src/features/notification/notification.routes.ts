import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleBatchMarkNotificationsAsRead,
  handleGetNotifications,
  handleMarkNotificationAsRead,
  handleSendSilentNotification,
} from "./notification.controller";

const router = express.Router();

router.get("/", requireAuth, handleGetNotifications);
router.patch("/:id/read", requireAuth, handleMarkNotificationAsRead);
router.post("/mark-many-read", requireAuth, handleBatchMarkNotificationsAsRead);
router.post("/silent", requireAuth, handleSendSilentNotification);



export default router;
