"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportStatusUpdateSchema = exports.reportTaskSchema = exports.REPORT_STATUSES = exports.REPORT_REASONS = void 0;
const zod_1 = require("zod");
exports.REPORT_REASONS = [
    "Harassment or bullying",
    "Hate or abusive content",
    "Sexual content",
    "Scam or spam",
    "Self-harm or dangerous behavior",
    "Other",
];
exports.REPORT_STATUSES = [
    "pending",
    "reviewed",
    "dismissed",
    "action_taken",
];
const REPORT_REASON_BY_KEY = {
    harassment: "Harassment or bullying",
    harassment_bullying: "Harassment or bullying",
    harassment_or_bullying: "Harassment or bullying",
    bullying: "Harassment or bullying",
    hate: "Hate or abusive content",
    abuse: "Hate or abusive content",
    abusive: "Hate or abusive content",
    hate_abuse: "Hate or abusive content",
    hate_or_abuse: "Hate or abusive content",
    hate_abusive_content: "Hate or abusive content",
    hate_or_abusive_content: "Hate or abusive content",
    sexual: "Sexual content",
    sexual_content: "Sexual content",
    scam: "Scam or spam",
    spam: "Scam or spam",
    scam_spam: "Scam or spam",
    scam_or_spam: "Scam or spam",
    self_harm: "Self-harm or dangerous behavior",
    self_harm_dangerous: "Self-harm or dangerous behavior",
    self_harm_dangerous_behavior: "Self-harm or dangerous behavior",
    dangerous_behavior: "Self-harm or dangerous behavior",
    self_harm_or_dangerous_behavior: "Self-harm or dangerous behavior",
    other: "Other",
};
function normalizeReportReason(value) {
    if (typeof value !== "string")
        return value;
    const trimmed = value.trim();
    const exactMatch = exports.REPORT_REASONS.find((reason) => reason === trimmed);
    if (exactMatch)
        return exactMatch;
    const key = trimmed
        .normalize("NFKC")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return REPORT_REASON_BY_KEY[key] ?? trimmed;
}
exports.reportTaskSchema = zod_1.z.object({
    reason: zod_1.z.preprocess(normalizeReportReason, zod_1.z.enum(exports.REPORT_REASONS)),
    details: zod_1.z
        .string()
        .trim()
        .max(1000, "Details must be 1000 characters or fewer")
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined)),
});
exports.reportStatusUpdateSchema = zod_1.z.object({
    status: zod_1.z.enum(exports.REPORT_STATUSES),
});
