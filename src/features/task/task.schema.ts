import { z } from "zod";

const helpersSchema = z.array(z.string()).optional();

export const baseTaskSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["reminder", "decision", "motivation", "advice"]),
  avatar: z.string().optional(),
});

export const reminderTaskSchema = baseTaskSchema.extend({
  type: z.literal("reminder"),
  remindAt: z.preprocess((val) => new Date(val as string), z.date()),
  helpers: helpersSchema, // ✅
});

export const decisionTaskSchema = baseTaskSchema.extend({
  type: z.literal("decision"),
  options: z.array(z.string()).min(2, "At least two options are required"),
  helpers: helpersSchema,
});

export const motivationTaskSchema = baseTaskSchema.extend({
  type: z.literal("motivation"),
  deliverAt: z
    .preprocess(
      (val) => (val ? new Date(val as string) : null),
      z.date().nullable()
    )
    .optional(),
  helpers: helpersSchema, // ✅
});

export const adviceTaskSchema = baseTaskSchema.extend({
  type: z.literal("advice"),
  helpers: helpersSchema, // ✅
});

export const taskSchema = z.discriminatedUnion("type", [
  reminderTaskSchema,
  decisionTaskSchema,
  motivationTaskSchema,
  adviceTaskSchema,
]);

const baseUpdateSchema = z.object({
  text: z.string().optional(),
  type: z.enum(["reminder", "decision", "motivation", "advice"]).optional(),
  avatar: z.string().optional(),
  name: z.string().optional(),
});

const reminderUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("reminder").optional(),
  remindAt: z
    .preprocess((val) => (val ? new Date(val as string) : undefined), z.date())
    .optional(),
  helpers: helpersSchema, // ✅
});

const decisionUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("decision").optional(),
  options: z.array(z.string()).min(2).optional(),
  // ❌ no helpers
});

const motivationUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("motivation").optional(),
  deliverAt: z
    .preprocess(
      (val) => (val ? new Date(val as string) : null),
      z.date().nullable()
    )
    .optional(),
  helpers: helpersSchema, // ✅
});

const adviceUpdateSchema = baseUpdateSchema.extend({
  type: z.literal("advice").optional(),
  helpers: helpersSchema, // ✅
});

export const taskUpdateSchema = z.union([
  reminderUpdateSchema,
  decisionUpdateSchema,
  motivationUpdateSchema,
  adviceUpdateSchema,
]);

export type CreateTaskSchemaInput = z.infer<typeof taskSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
