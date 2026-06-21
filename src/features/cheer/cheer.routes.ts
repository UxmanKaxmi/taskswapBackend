import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { handleCheerBeat } from "./cheer.controller";

const router = Router();

router.post("/:beatId/cheer", requireAuth, handleCheerBeat);

export default router;
