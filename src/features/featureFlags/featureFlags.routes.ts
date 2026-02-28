import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleGetFeatureFlags,
  handleUpdateFeatureFlags,
} from "./featureFlags.controller";
import { optionalAuth } from "../../middleware/optionalAuth";

const router = express.Router();

router.get("/", optionalAuth, handleGetFeatureFlags);
router.patch("/", requireAuth, handleUpdateFeatureFlags);

export default router;
