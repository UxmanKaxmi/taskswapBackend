import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import {
  handleResetFirstTimeHints,
  handleWriteFirstTimeHintState,
} from "./hints.controller";

const router = express.Router();

// POST /users/me/hints/:hintId — record completed | dismissed for the
// signed-in user. Idempotent; unknown hint ids get a 422.
router.post("/:hintId", requireAuth, handleWriteFirstTimeHintState);

// DELETE /users/me/hints — reset the caller's own map to all-pending so the
// hints re-teach. Used by the client's debug tools; self-scoped, so safe to
// keep registered in every environment.
router.delete("/", requireAuth, handleResetFirstTimeHints);

export default router;
