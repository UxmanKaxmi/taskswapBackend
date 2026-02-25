"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../../middleware/requireAuth");
const referral_controller_1 = require("./referral.controller");
const router = express_1.default.Router();
// Authenticated: used by the Invite Friends screen
router.get("/link", requireAuth_1.requireAuth, referral_controller_1.getReferralLink); //
router.post("/link/rotate", requireAuth_1.requireAuth, referral_controller_1.rotateReferralLink);
// Public: called on deep-link open (before login/signup)
router.post("/attribute", referral_controller_1.attributeReferral);
exports.default = router;
