"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommentSchema = void 0;
const zod_1 = require("zod");
// Schema for creating a comment
exports.createCommentSchema = zod_1.z.object({
    text: zod_1.z.string().min(1, "Comment text is required"),
    taskId: zod_1.z.string().uuid(),
    mentions: zod_1.z.array(zod_1.z.string().regex(/^\d+$/, "Must be a numeric ID")), // ✅ only digits
});
