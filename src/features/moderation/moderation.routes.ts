import { Router } from "express";
import {
  handleBlockUser,
  handleListBlockedUsers,
  handleListReports,
  handleReportTask,
  handleUnblockUser,
  handleUpdateReportStatus,
} from "./moderation.controller";
import { requireAuth } from "../../middleware/requireAuth";
import { requireAdmin } from "../../middleware/requireAdmin";

const taskModerationRoutes = Router();
const userModerationRoutes = Router();
const adminModerationRoutes = Router();

taskModerationRoutes.post("/:taskId/report", requireAuth, handleReportTask);
userModerationRoutes.get("/me/blocked-users", requireAuth, handleListBlockedUsers);
userModerationRoutes.post("/:userId/block", requireAuth, handleBlockUser);
userModerationRoutes.delete("/:userId/block", requireAuth, handleUnblockUser);

adminModerationRoutes.get(
  "/reports",
  requireAuth,
  requireAdmin,
  handleListReports
);
adminModerationRoutes.patch(
  "/reports/:reportId/status",
  requireAuth,
  requireAdmin,
  handleUpdateReportStatus
);

export { taskModerationRoutes, userModerationRoutes, adminModerationRoutes };
