import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { optionalAuth } from "../../middleware/optionalAuth";
import {
  handleCreateCircle,
  handleCreateCircleInvite,
  handleGetCircle,
  handleGetInvitePreview,
  handleJoinCircleInvite,
  handleLeaveCircle,
  handleNudgeCircleMember,
  handlePushAllCircle,
} from "./circle.controller";

// Mounted at /circles
export const circleRoutes = Router();

circleRoutes.post("/", requireAuth, handleCreateCircle);
circleRoutes.get("/:id", optionalAuth, handleGetCircle);
circleRoutes.post("/:id/invites", requireAuth, handleCreateCircleInvite);
circleRoutes.post("/:id/leave", requireAuth, handleLeaveCircle);
circleRoutes.post("/:id/push-all", requireAuth, handlePushAllCircle);
circleRoutes.post("/:id/members/:userId/nudge", requireAuth, handleNudgeCircleMember);

// Mounted at /invites — the web landing page reads the preview unauthenticated;
// joining requires auth.
export const circleInviteRoutes = Router();

circleInviteRoutes.get("/:token/preview", handleGetInvitePreview);
circleInviteRoutes.post("/:token/join", requireAuth, handleJoinCircleInvite);
