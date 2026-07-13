import { z } from "zod";
import { feelingSchema, TASK_TEXT_MAX } from "../task/task.schema";

export const createCircleSchema = z.object({
  goalText: z
    .string()
    .trim()
    .min(1)
    .max(TASK_TEXT_MAX, `Text must be ${TASK_TEXT_MAX} characters or fewer`),
  feeling: feelingSchema,
  // Passed through so the service can reject the circles×anonymity combination
  // with a clear error instead of silently stripping it.
  isAnonymous: z.boolean().optional(),
  // Friends already on PushMeUp to invite in-app (notification → join screen).
  // External friends ride the share sheet instead.
  inviteUserIds: z
    .array(z.string())
    .max(4, "You can invite up to 4 people")
    .optional(),
});

export const joinCircleSchema = z.object({
  feeling: feelingSchema,
});

export type CreateCircleInput = z.infer<typeof createCircleSchema>;
export type JoinCircleInput = z.infer<typeof joinCircleSchema>;
