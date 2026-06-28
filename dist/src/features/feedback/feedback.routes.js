"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const optionalAuth_1 = require("../../middleware/optionalAuth");
const feedback_controller_1 = require("./feedback.controller");
const router = express_1.default.Router();
// Feedback can be sent by guests too, so auth is optional. When a valid token
// is present the feedback is linked to that user.
router.post("/", optionalAuth_1.optionalAuth, feedback_controller_1.handleSubmitFeedback);
exports.default = router;
