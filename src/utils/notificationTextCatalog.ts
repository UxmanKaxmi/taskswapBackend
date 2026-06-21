export const DEFAULT_TEST_NOTIFICATION_TEXT = {
  title: "🔔 Debug Test",
  body: "This is a test push notification!",
};

export function getTestNotificationText() {
  return DEFAULT_TEST_NOTIFICATION_TEXT;
}

export function getMotivationMilestoneNotificationText(pushCount: number) {
  return {
    title: "🔥 Momentum milestone!",
    body: `Your task just passed ${pushCount} pushes. Keep it going.`,
  };
}

export function getMotivationPushNotificationText(taskText: string) {
  return {
    title: "💪 You got a push",
    body: `Someone pushed you: "${taskText}"`,
  };
}

export function getProgressUpdateNotificationText(taskText: string, senderName: string) {
  return {
    title: "📈 New update",
    body: `${senderName} shared an update on "${taskText}"`,
  };
}

// TODO: not aligned with push-only. "Reminder" is no longer a feature. Update or remove.
export function getTaskReminderPushNotificationText(taskText: string) {
  return {
    title: "⏰ Reminder",
    body: `It's time: "${taskText}"`,
  };
}

// TODO: not aligned with push-only. The advice/decision/reminder branches are dead; simplify to push only.
export function getHelperNotificationText(taskType: string, taskText: string) {
  const typeLabelMap: Record<string, string> = {
    reminder: "a reminder",
    advice: "your advice",
    motivation: "motivation",
    decision: "your input",
  };

  const bodyLabel = typeLabelMap[taskType] ?? "help";

  return {
    title: "🤝 Someone asked for your help",
    body: `You were asked to help with ${bodyLabel}: “${taskText}”`,
  };
}

// TODO: not aligned with push-only. "Reminder" is no longer a feature. Update or remove.
export function getReminderNoteNotificationText(message: string) {
  return {
    title: "⏰ You got a reminder!",
    body: message,
  };
}

export function getHelpPushReminderNotificationText(taskCount: number) {
  return {
    title: "Someone could use a push today",
    body:
      taskCount === 1
        ? "One task is waiting for your push."
        : `${taskCount} tasks are waiting for your push.`,
  };
}

export function getUnfinishedMotivationReminderText(taskText: string) {
  return {
    title: "Keep going",
    body: `Your task "${taskText}" is still waiting.`,
  };
}

// TODO: not aligned with push-only. "Decision" is no longer a feature. Update or remove.
export function getDecisionFinalizedNotificationText() {
  return {
    title: "✅ Decision Finalized",
    body: "A decision you helped with is complete.",
  };
}

export function getCommentMentionPushText(commentText: string) {
  return {
    title: "💬 You were mentioned",
    body: `${commentText.slice(0, 50)}...`,
  };
}

export function getTaskHelperNotificationMessage() {
  return "asked you to push them";
}

export function getTaskProgressUpdateNotificationMessage(senderName: string) {
  return `${senderName} shared an update on your task.`;
}

// TODO: not aligned with push-only. "Decision" is no longer a feature. Update or remove.
export function getDecisionDoneNotificationMessage(taskText: string) {
  return `marked the decision “${taskText}” as done.`;
}

// TODO: not aligned with push-only. "Advice" is no longer a feature. Update or remove.
export function getTaskAdviceNotificationMessage() {
  return "gave advice on your task";
}

export function getCommentMentionNotificationMessage() {
  return "mentioned you in a comment";
}

export function getMotivationPushNotificationMessage() {
  return "pushed you 💪";
}

export function getTaskCheerNotificationMessage(
  senderName: string,
  beatType: "post" | "update",
  otherCount = 0
) {
  const target = beatType === "update" ? "update" : "task";

  if (otherCount > 0) {
    const otherLabel = otherCount === 1 ? "other" : "others";
    return `${senderName} and ${otherCount} ${otherLabel} cheered your ${target}`;
  }

  return `${senderName} cheered your ${target}`;
}

export function getTaskCheerPushText(
  senderName: string,
  beatType: "post" | "update",
  otherCount = 0
) {
  return {
    title: "PushMeUp",
    body: getTaskCheerNotificationMessage(senderName, beatType, otherCount),
  };
}

export function getNotificationMarkerMessage() {
  return "milestone reached";
}

// TODO: not aligned with push-only. "Reminder" is no longer a feature. Update or remove.
export function getReminderReceivedNotificationMessage(senderName: string) {
  return `${senderName} reminded you about your task.`;
}

export function getFollowNotificationMessage(followerName: string) {
  return `${followerName} followed you`;
}

export function getReferralShareText() {
  return {
    title: "Invite to PushMeUp",
    message:
      "Join me on PushMeUp. Post a goal and get real pushes from people who want you to win.",
  };
}

export function getReferralInviteText() {
  return {
    title: "Invite to PushMeUp",
    body: "Join me on PushMeUp. Post a goal and get real pushes from people who want you to win.",
  };
}
