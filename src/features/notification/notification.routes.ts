import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleGetNotifications,
  handleMarkNotificationAsRead,
} from "./notification.controller";

const router = express.Router();

router.get("/", requireAuth, handleGetNotifications);
router.patch("/:id/read", requireAuth, handleMarkNotificationAsRead);

export default router;
