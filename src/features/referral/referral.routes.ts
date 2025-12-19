import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  getReferralLink,
  rotateReferralLink,
  attributeReferral,
} from "./referral.controller";

const router = express.Router();

// Authenticated: used by the Invite Friends screen
router.get("/link", requireAuth, getReferralLink); //
router.post("/link/rotate", requireAuth, rotateReferralLink);

// Public: called on deep-link open (before login/signup)
router.post("/attribute", attributeReferral);

export default router;
