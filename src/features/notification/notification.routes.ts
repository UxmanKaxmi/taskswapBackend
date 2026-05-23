import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleBatchMarkNotificationsAsRead,
  handleGetNotifications,
  handleMarkNotificationAsRead,
} from "./notification.controller";

const router = express.Router();

router.get("/", requireAuth, handleGetNotifications);
router.patch("/:id/read", requireAuth, handleMarkNotificationAsRead);
router.post("/mark-many-read", requireAuth, handleBatchMarkNotificationsAsRead);



export default router;
