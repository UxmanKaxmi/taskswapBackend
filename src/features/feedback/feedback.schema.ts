import { z } from "zod";

export const FEEDBACK_CATEGORIES = [
  "confusing",
  "bug",
  "idea",
  "positive",
  "other",
] as const;

export const submitFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  message: z.string().trim().min(1, "Message is required").max(5000),
  appVersion: z.string().trim().min(1),
  platform: z.enum(["ios", "android"]),
  device: z.string().trim().optional(),
  osVersion: z.string().trim().optional(),
  currentScreen: z.string().trim().optional(),
  loggedInUserId: z.string().trim().optional(),
  // ISO timestamp from the client; coerced to a Date.
  timeSubmitted: z.preprocess(
    (val) => (val ? new Date(val as string) : new Date()),
    z.date()
  ),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
