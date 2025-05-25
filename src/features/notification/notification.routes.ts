import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleGetNotifications,
  handleMarkNotificationAsRead,
  handleTestSendNotification,
} from "./notification.controller";

const router = express.Router();

router.get("/", requireAuth, handleGetNotifications);
router.patch("/:id/read", requireAuth, handleMarkNotificationAsRead);
router.post("/test", requireAuth, handleTestSendNotification); // POST /api/notification/test

export default router;
