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
    TASK_ADVICE: "task-advice",
    TASK_MOTIVATION_PUSH: "task-motivation-push",
    TASK_MOTIVATION_MILESTONE: "task-motivation-milestone",
    TASK_MOTIVATION_MILESTONE_SENT: "task-motivation-milestone-sent"



} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];