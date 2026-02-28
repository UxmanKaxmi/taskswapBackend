"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../../middleware/requireAuth");
const featureFlags_controller_1 = require("./featureFlags.controller");
const optionalAuth_1 = require("@middleware/optionalAuth");
const router = express_1.default.Router();
router.get("/", optionalAuth_1.optionalAuth, featureFlags_controller_1.handleGetFeatureFlags);
router.patch("/", requireAuth_1.requireAuth, featureFlags_controller_1.handleUpdateFeatureFlags);
exports.default = router;
