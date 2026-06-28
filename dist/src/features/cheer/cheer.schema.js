"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cheerSchema = void 0;
const zod_1 = require("zod");
exports.cheerSchema = zod_1.z.object({
    presetKey: zod_1.z.string().min(1),
});
