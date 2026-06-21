import express from "express";
import { optionalAuth } from "../../middleware/optionalAuth";
import { handleSubmitFeedback } from "./feedback.controller";

const router = express.Router();

// Feedback can be sent by guests too, so auth is optional. When a valid token
// is present the feedback is linked to that user.
router.post("/", optionalAuth, handleSubmitFeedback);

export default router;
