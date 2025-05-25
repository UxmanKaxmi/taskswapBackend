"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../../middleware/requireAuth");
const notification_controller_1 = require("./notification.controller");
const router = express_1.default.Router();
router.get("/", requireAuth_1.requireAuth, notification_controller_1.handleGetNotifications);
router.patch("/:id/read", requireAuth_1.requireAuth, notification_controller_1.handleMarkNotificationAsRead);
router.post("/test", requireAuth_1.requireAuth, notification_controller_1.handleTestSendNotification); // POST /api/notification/test
exports.default = router;
