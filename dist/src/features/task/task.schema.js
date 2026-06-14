"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskUpdateSchema = exports.taskSchema = exports.adviceTaskSchema = exports.motivationTaskSchema = exports.decisionTaskSchema = exports.reminderTaskSchema = exports.baseTaskSchema = void 0;
const zod_1 = require("zod");
const task_types_1 = require("./task.types");
const helpersSchema = zod_1.z.array(zod_1.z.string()).optional();
exports.baseTaskSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    type: zod_1.z.enum(["reminder", "decision", "motivation", "advice"]),
    avatar: zod_1.z.string().optional(),
    feeling: zod_1.z.enum(task_types_1.FEELING_TAGS).nullable().optional(),
});
exports.reminderTaskSchema = exports.baseTaskSchema.extend({
    type: zod_1.z.literal("reminder"),
    remindAt: zod_1.z.preprocess((val) => new Date(val), zod_1.z.date()),
    helpers: helpersSchema, // ✅
});
exports.decisionTaskSchema = exports.baseTaskSchema.extend({
    type: zod_1.z.literal("decision"),
    options: zod_1.z
        .array(zod_1.z.string().transform((o) => o.trim()))
        .min(2, "At least two options are required")
        .superRefine((options, ctx) => {
        const normalized = options.map((o) => o.toLowerCase());
        const unique = new Set(normalized);
        if (unique.size !== normalized.length) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Decision options must be unique",
            });
        }
    }),
    helpers: helpersSchema,
});
exports.motivationTaskSchema = exports.baseTaskSchema.extend({
    type: zod_1.z.literal("motivation"),
    deliverAt: zod_1.z
        .preprocess((val) => (val ? new Date(val) : null), zod_1.z.date().nullable())
        .optional(),
    helpers: helpersSchema, // ✅
});
exports.adviceTaskSchema = exports.baseTaskSchema.extend({
    type: zod_1.z.literal("advice"),
    helpers: helpersSchema, // ✅
});
exports.taskSchema = zod_1.z.discriminatedUnion("type", [
    exports.reminderTaskSchema,
    exports.decisionTaskSchema,
    exports.motivationTaskSchema,
    exports.adviceTaskSchema,
]);
const baseUpdateSchema = zod_1.z.object({
    text: zod_1.z.string().optional(),
    type: zod_1.z.enum(["reminder", "decision", "motivation", "advice"]).optional(),
    avatar: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    feeling: zod_1.z.enum(task_types_1.FEELING_TAGS).nullable().optional(),
});
const reminderUpdateSchema = baseUpdateSchema.extend({
    type: zod_1.z.literal("reminder").optional(),
    remindAt: zod_1.z
        .preprocess((val) => (val ? new Date(val) : undefined), zod_1.z.date())
        .optional(),
    helpers: helpersSchema, // ✅
});
const decisionUpdateSchema = baseUpdateSchema.extend({
    type: zod_1.z.literal("decision").optional(),
    options: zod_1.z
        .array(zod_1.z.string().transform((o) => o.trim()))
        .min(2)
        .optional()
        .superRefine((options, ctx) => {
        if (!options)
            return;
        const normalized = options.map((o) => o.toLowerCase());
        const unique = new Set(normalized);
        if (unique.size !== normalized.length) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Decision options must be unique",
            });
        }
    }),
});
const motivationUpdateSchema = baseUpdateSchema.extend({
    type: zod_1.z.literal("motivation").optional(),
    deliverAt: zod_1.z
        .preprocess((val) => (val ? new Date(val) : null), zod_1.z.date().nullable())
        .optional(),
    helpers: helpersSchema, // ✅
});
const adviceUpdateSchema = baseUpdateSchema.extend({
    type: zod_1.z.literal("advice").optional(),
    helpers: helpersSchema, // ✅
});
exports.taskUpdateSchema = zod_1.z.union([
    reminderUpdateSchema,
    decisionUpdateSchema,
    motivationUpdateSchema,
    adviceUpdateSchema,
]);
