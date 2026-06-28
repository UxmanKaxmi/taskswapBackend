"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitFeedbackSchema = exports.FEEDBACK_CATEGORIES = void 0;
const zod_1 = require("zod");
exports.FEEDBACK_CATEGORIES = [
    "confusing",
    "bug",
    "idea",
    "positive",
    "other",
];
exports.submitFeedbackSchema = zod_1.z.object({
    category: zod_1.z.enum(exports.FEEDBACK_CATEGORIES).optional(),
    message: zod_1.z.string().trim().min(1, "Message is required").max(5000),
    appVersion: zod_1.z.string().trim().min(1),
    platform: zod_1.z.enum(["ios", "android"]),
    device: zod_1.z.string().trim().optional(),
    osVersion: zod_1.z.string().trim().optional(),
    currentScreen: zod_1.z.string().trim().optional(),
    loggedInUserId: zod_1.z.string().trim().optional(),
    // ISO timestamp from the client; coerced to a Date.
    timeSubmitted: zod_1.z.preprocess((val) => (val ? new Date(val) : new Date()), zod_1.z.date()),
});
