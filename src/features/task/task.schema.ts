import { z } from "zod";

export const baseTaskSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["reminder", "decision", "motivation", "advice"]),
  avatar: z.string().optional(),
});

export const reminderTaskSchema = baseTaskSchema.extend({
  type: z.literal("reminder"),
  remindAt: z.preprocess((val) => new Date(val as string), z.date()),
});

export const decisionTaskSchema = baseTaskSchema.extend({
  type: z.literal("decision"),
  options: z.array(z.string()).min(2, "At least two options are required"),
});

export const motivationTaskSchema = baseTaskSchema.extend({
  type: z.literal("motivation"),
  deliverAt: z
    .preprocess(
      (val) => (val ? new Date(val as string) : null),
      z.date().nullable()
    )
    .optional(),
});

export const adviceTaskSchema = baseTaskSchema.extend({
  type: z.literal("advice"),
});

export const taskSchema = z.discriminatedUnion("type", [
  reminderTaskSchema,
  decisionTaskSchema,
  motivationTaskSchema,
  adviceTaskSchema,
]);

// TypeScript inference
export type CreateTaskSchemaInput = z.infer<typeof taskSchema>;

// Partial base schema
const baseUpdateSchema = z.object({
  text: z.string().optional(),
  type: z.enum(["reminder", "decision", "motivation", "advice"]).optional(),
  avatar: z.string().optional(),
  name: z.string().optional(),
});

// Optional extensions
const reminderUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("reminder").optional(),
  remindAt: z
    .preprocess((val) => (val ? new Date(val as string) : undefined), z.date())
    .optional(),
});

const decisionUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("decision").optional(),
  options: z.array(z.string()).min(2).optional(),
});

const motivationUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("motivation").optional(),
  deliverAt: z
    .preprocess(
      (val) => (val ? new Date(val as string) : null),
      z.date().nullable()
    )
    .optional(),
});

const adviceUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("advice").optional(),
});

export const taskUpdateSchema = z.union([
  reminderUpdateSchema,
  decisionUpdateSchema,
  motivationUpdateSchema,
  adviceUpdateSchema,
]);

export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
