// src/types/notification.types.ts

// 1) Canonical type strings (camelCase)
export const NOTIFICATION_TYPES = {
  reminder: "reminder",
  decision: "decision",
  motivation: "motivation",
  advice: "advice",
  follow: "follow",
  comment: "comment",
  task: "task",

  // notifications we added
  taskHelper: "taskHelper",
  decisionDone: "decisionDone",
  commentMention: "commentMention",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

// 2) Metadata shapes per notification type
export type TaskRefMeta = {
  taskId: string;
  taskText?: string;
};

export type DecisionDoneMeta = TaskRefMeta & {};
export type TaskHelperMeta = TaskRefMeta & {};
export type CommentMentionMeta = TaskRefMeta & {
  commentId: string;
  commentText?: string;
};

// Map each type → its metadata (extend as needed)
export interface MetadataByType {
  reminder: TaskRefMeta;
  decision: TaskRefMeta;
  motivation: TaskRefMeta;
  advice: TaskRefMeta;
  follow: Record<string, never>; // none
  comment: Record<string, never>;
  task: TaskRefMeta;

  taskHelper: TaskHelperMeta;
  decisionDone: DecisionDoneMeta;
  commentMention: CommentMentionMeta;
}

// 3) Sender shown alongside notifications
export interface NotificationSenderDTO {
  id: string;
  name: string;
  photo?: string;
}

// 4) Strongly-typed Notification DTO
// Use a generic so callers can narrow when they know the specific type.
export interface NotificationDTO<
  T extends NotificationType = NotificationType
> {
  id: string;
  userId: string;
  type: T;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: MetadataByType[T]; // typed by 'type'
  sender?: NotificationSenderDTO;
}
