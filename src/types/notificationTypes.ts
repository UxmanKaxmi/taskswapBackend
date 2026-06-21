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
    TASK_PROGRESS_UPDATE: "task-progress-update",
    TASK_MOTIVATION_PUSH: "task-motivation-push",
    TASK_CHEER: "task-cheer",
    TASK_MOTIVATION_MILESTONE: "task-motivation-milestone",
    TASK_MOTIVATION_MILESTONE_SENT: "task-motivation-milestone-sent",
    TASK_MOTIVATION_UNFINISHED_REMINDER: "task-motivation-unfinished-reminder",
    TASK_MOTIVATION_HELP_PUSH_REMINDER: "task-motivation-help-push-reminder"



} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
