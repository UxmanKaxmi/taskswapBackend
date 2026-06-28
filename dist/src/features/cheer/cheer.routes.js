"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../../middleware/requireAuth");
const cheer_controller_1 = require("./cheer.controller");
const router = (0, express_1.Router)();
router.post("/:beatId/cheer", requireAuth_1.requireAuth, cheer_controller_1.handleCheerBeat);
exports.default = router;
