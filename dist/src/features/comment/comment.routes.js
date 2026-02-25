"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const comment_controller_1 = require("./comment.controller");
const requireAuth_1 = require("../../middleware/requireAuth");
const optionalAuth_1 = require("../../middleware/optionalAuth");
const router = express_1.default.Router();
// Create a new comment → login required
router.post("/", requireAuth_1.requireAuth, comment_controller_1.handleCreateComment);
// Get comments for a specific task → PUBLIC
router.get("/:taskId", optionalAuth_1.optionalAuth, comment_controller_1.handleGetComments);
// Toggle like for a comment → login required
router.post("/like", requireAuth_1.requireAuth, comment_controller_1.handleToggleLike);
exports.default = router;
