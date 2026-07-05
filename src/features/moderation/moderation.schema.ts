import { z } from "zod";

export const REPORT_REASONS = [
  "Harassment or bullying",
  "Hate or abusive content",
  "Sexual content",
  "Scam or spam",
  "Self-harm or dangerous behavior",
  "Other",
] as const;

export const REPORT_STATUSES = [
  "pending",
  "reviewed",
  "dismissed",
  "action_taken",
] as const;

const REPORT_REASON_BY_KEY: Record<string, (typeof REPORT_REASONS)[number]> = {
  harassment: "Harassment or bullying",
  harassment_bullying: "Harassment or bullying",
  harassment_or_bullying: "Harassment or bullying",
  bullying: "Harassment or bullying",
  hate: "Hate or abusive content",
  abuse: "Hate or abusive content",
  abusive: "Hate or abusive content",
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

function normalizeReportReason(value: unknown) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  const exactMatch = REPORT_REASONS.find((reason) => reason === trimmed);
  if (exactMatch) return exactMatch;

  const key = trimmed
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return REPORT_REASON_BY_KEY[key] ?? trimmed;
}

export const reportTaskSchema = z.object({
  reason: z.preprocess(normalizeReportReason, z.enum(REPORT_REASONS)),
  details: z
    .string()
    .trim()
    .max(1000, "Details must be 1000 characters or fewer")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const reportStatusUpdateSchema = z.object({
  status: z.enum(REPORT_STATUSES),
});

export type ReportTaskInput = z.infer<typeof reportTaskSchema>;
export type ReportStatusUpdateInput = z.infer<typeof reportStatusUpdateSchema>;
