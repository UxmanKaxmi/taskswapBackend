"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../../middleware/requireAuth");
const push_controller_1 = require("./push.controller");
const router = express_1.default.Router();
router.get("/", push_controller_1.handleGetPush); // Optional test route
// Requires auth
router.post("/:id/push", requireAuth_1.requireAuth, push_controller_1.togglePush);
router.get("/:id/pushes", requireAuth_1.requireAuth, push_controller_1.getPushes);
exports.default = router;
