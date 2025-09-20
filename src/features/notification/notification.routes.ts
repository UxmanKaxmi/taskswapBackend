import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleBatchMarkNotificationsAsRead,
  handleGetNotifications,
  handleMarkNotificationAsRead,
  handleTestSendNotification,
} from "./notification.controller";

const router = express.Router();

router.get("/", requireAuth, handleGetNotifications);
router.patch("/:id/read", requireAuth, handleMarkNotificationAsRead);
router.post("/test", requireAuth, handleTestSendNotification); // POST /api/notification/test
router.post("/mark-many-read", requireAuth, handleBatchMarkNotificationsAsRead);



export default router;
