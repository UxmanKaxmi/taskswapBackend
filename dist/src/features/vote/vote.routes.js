"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../../middleware/requireAuth");
const vote_controller_1 = require("./vote.controller");
const router = express_1.default.Router();
router.get("/", vote_controller_1.handleGetVote); // Optional test route
// Requires auth
router.post("/tasks/:id/vote", requireAuth_1.requireAuth, vote_controller_1.castVote);
router.get("/tasks/:id/votes", requireAuth_1.requireAuth, vote_controller_1.getVotes);
exports.default = router;
