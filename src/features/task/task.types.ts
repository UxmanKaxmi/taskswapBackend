export type TaskType = "reminder" | "advice" | "decision" | "motivation";
export type FeedSort = "all" | "needs_push" | "new" | "almost_there";

export const FEELING_TAGS = [
  "stuck",
  "nervous",
  "tired",
  "avoiding_it",
  "overwhelmed",
  "almost_there",
] as const;

export type FeelingTag = (typeof FEELING_TAGS)[number];

/**
 * Shared fields across all task types.
 */
interface TaskBase {
  text: string;
  userId: string;
  avatar?: string;
  name?: string;
  feeling?: FeelingTag | null;
  isAnonymous?: boolean;
}

/**
 * Reminder Task – includes reminder time and optional helpers.
 */
export interface ReminderTaskType extends TaskBase {
  type: "reminder";
  remindAt: Date;
  helpers?: string[];
}

/**
 * Advice Task – includes optional helpers.
 */
export interface AdviceTaskType extends TaskBase {
  type: "advice";
  helpers?: string[];
}

/**
 * Decision Task – includes required options (at least two).
 */
export interface DecisionTaskType extends TaskBase {
  type: "decision";
  options: string[];
  helpers?: string[];
  votes?: Record<string, number>; // ✅ optional
}

/**
 * Motivation Task – includes optional delivery time and optional helpers.
 */
export interface MotivationTaskType extends TaskBase {
  type: "motivation";
  deliverAt?: Date | null;
  helpers?: string[];
}

/**
 * Union of all task creation inputs.
 */
export type CreateTaskInput =
  | ReminderTaskType
  | AdviceTaskType
  | DecisionTaskType
  | MotivationTaskType;

/**
 * A fully created task with system-generated fields.
 */
export type Task = CreateTaskInput & {
  id: string;
  createdAt: Date;
};

/**
 * Optional filters when fetching tasks.
 */
export type GetAllTasksHelpers = {
  excludeSelf?: boolean; // If true, don't include user's own tasks
  limit?: number; // Limit number of tasks returned
  cursor?: string; // Cursor pointing to the last-seen task
  sort?: FeedSort;
};
