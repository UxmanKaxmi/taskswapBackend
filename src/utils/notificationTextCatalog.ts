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

// Sent to earlier pushers when a goal they pushed crosses a push milestone.
export function getPushedTaskMilestoneNotificationText(pushCount: number) {
  return {
    title: "🔥 Your push is paying off",
    body: `${pushCount} people have now pushed the goal you pushed.`,
  };
}

// Inbox message for the same event — includes the goal text for context.
export function getPushedTaskMilestoneNotificationMessage(
  pushCount: number,
  taskText: string
) {
  return `${pushCount} people have now pushed "${taskText}"`;
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

export function getFollowPushText(followerName: string) {
  return {
    title: "🎉 New follower",
    body: `${followerName} started following you`,
  };
}

export function getTaskAdvicePushText(taskText: string) {
  return {
    title: "💡 New advice on your goal",
    body: `Someone shared advice on "${taskText}"`,
  };
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

// --- Circles: members hear about each other's positive events only ---
// Inbox messages deliberately omit the actor's name: the notification row
// renders the bold sender name itself, then this message, then a quoted
// metadata.taskText line — so every send must set metadata.taskText.

export function getCircleInviteNotificationMessage() {
  return "wants you in their circle";
}

export function getCircleInvitePushText(name: string, goalText: string) {
  return {
    title: `⭕ ${name} wants you in their circle`,
    body: `"${goalText}". Same sentence, own momentum. Tap to join.`,
  };
}

export function getCircleNudgeNotificationMessage() {
  return "nudged you — thinking of you";
}

export function getCircleNudgePushText(name: string, goalText: string) {
  return {
    title: `👋 ${name} is thinking of you`,
    body: `"${goalText}". A quiet nudge, no pressure.`,
  };
}

export function getCircleMemberJoinedNotificationMessage() {
  return "joined your circle";
}

export function getCircleMemberJoinedPushText(name: string, goalText: string) {
  return {
    title: "⭕ Your circle is growing",
    body: `${name} is in: "${goalText}"`,
  };
}

export function getCircleProgressUpdateNotificationMessage() {
  return "shared an update in your circle";
}

export function getCircleProgressUpdatePushText(name: string, progressText: string) {
  return {
    title: "⭕ Update in your circle",
    body: `${name}: "${progressText}"`,
  };
}

export function getCircleMemberDoneNotificationMessage() {
  return "took the win in your circle";
}

export function getCircleMemberDonePushText(name: string, goalText: string) {
  return {
    title: "🏁 One of you is done",
    body: `${name} took the win: "${goalText}"`,
  };
}

export function getCircleCompleteNotificationMessage() {
  return "Your circle did it. All of you.";
}

export function getCircleCompletePushText(doneCount: number) {
  return {
    title: "🏆 Your circle did it. All of you.",
    body: `${doneCount} of us said we'd do it. ${doneCount} of us did.`,
  };
}

// Quiet, owner-only: dissolves have no public trace and no push banner.
export function getCircleDissolvedNotificationMessage() {
  return "Your circle wound down, so your goal is back to solo. All your progress is intact.";
}

export function getCircleInviteShareText(goalText: string, inviteLink: string) {
  return `Hey. I'm starting "${goalText}" on PushMeUp and I want you in my circle. Join me: ${inviteLink}`;
}
