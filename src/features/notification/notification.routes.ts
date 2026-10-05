import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";
import {
  handleAnnounceFeatureRelease,
  handleBatchMarkNotificationsAsRead,
  handleGetNotifications,
  handleMarkNotificationAsRead,
  handlePreviewFeatureRelease,
  handleSendSilentNotification,
} from "./notification.controller";

const router = express.Router();

router.get("/", requireAuth, handleGetNotifications);
router.patch("/:id/read", requireAuth, handleMarkNotificationAsRead);
router.post("/mark-many-read", requireAuth, handleBatchMarkNotificationsAsRead);
router.post("/silent", requireAuth, handleSendSilentNotification);
router.post("/feature-release/preview", requireAuth, handlePreviewFeatureRelease);
router.post(
  "/feature-release",
  requireAuth,
  requireAdmin,
  handleAnnounceFeatureRelease
);



export default router;
