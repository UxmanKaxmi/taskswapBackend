export const NOTIFICATION_TYPES = {
    REMINDER: 'reminder',
    DECISION: 'decision',
    MOTIVATION: 'motivation',
    ADVICE: 'advice',
    FOLLOW: 'follow',
    COMMENT: 'comment',
    TASK: 'task',
    TASK_HELPER: 'task-helper',
    DECISION_DONE: 'decision-done',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];