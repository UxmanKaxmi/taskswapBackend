"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const feed_controller_1 = require("./feed.controller");
const optionalAuth_1 = require("../../middleware/optionalAuth");
const router = (0, express_1.Router)();
// GET /feed → Handles guest + logged-in users
router.get("/", optionalAuth_1.optionalAuth, feed_controller_1.getFeed);
exports.default = router;
