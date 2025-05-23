export type TaskType = "reminder" | "advice" | "decision" | "motivation";

interface TaskBase {
  text: string;
  userId: string;
  avatar?: string;
  name?: string;
}

export interface ReminderTaskType extends TaskBase {
  type: "reminder";
  remindAt: Date;
}

export interface AdviceTaskType extends TaskBase {
  type: "advice";
}

export interface DecisionTaskType extends TaskBase {
  type: "decision";
  options: string[]; // Should contain at least 2 items
}

export interface MotivationTaskType extends TaskBase {
  type: "motivation";
  deliverAt?: Date | null;
}

export type CreateTaskInput =
  | ReminderTaskType
  | AdviceTaskType
  | DecisionTaskType
  | MotivationTaskType;

export type Task = CreateTaskInput & {
  id: string;
  createdAt: Date;
};
