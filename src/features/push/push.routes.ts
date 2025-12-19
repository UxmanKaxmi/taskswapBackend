import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  togglePush,
  getPushes,
  handleGetPush,
} from "./push.controller";

const router = express.Router();

router.get("/", handleGetPush); // Optional test route

// Requires auth
router.post("/:id/push", requireAuth, togglePush);
router.get("/:id/pushes", requireAuth, getPushes);

export default router;