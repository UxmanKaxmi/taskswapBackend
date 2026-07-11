"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TEST_NOTIFICATION_TEXT = void 0;
exports.getTestNotificationText = getTestNotificationText;
exports.getMotivationMilestoneNotificationText = getMotivationMilestoneNotificationText;
exports.getPushedTaskMilestoneNotificationText = getPushedTaskMilestoneNotificationText;
exports.getPushedTaskMilestoneNotificationMessage = getPushedTaskMilestoneNotificationMessage;
exports.getMotivationPushNotificationText = getMotivationPushNotificationText;
exports.getProgressUpdateNotificationText = getProgressUpdateNotificationText;
exports.getTaskReminderPushNotificationText = getTaskReminderPushNotificationText;
exports.getHelperNotificationText = getHelperNotificationText;
exports.getReminderNoteNotificationText = getReminderNoteNotificationText;
exports.getHelpPushReminderNotificationText = getHelpPushReminderNotificationText;
exports.getUnfinishedMotivationReminderText = getUnfinishedMotivationReminderText;
exports.getDecisionFinalizedNotificationText = getDecisionFinalizedNotificationText;
exports.getCommentMentionPushText = getCommentMentionPushText;
exports.getTaskHelperNotificationMessage = getTaskHelperNotificationMessage;
exports.getTaskProgressUpdateNotificationMessage = getTaskProgressUpdateNotificationMessage;
exports.getDecisionDoneNotificationMessage = getDecisionDoneNotificationMessage;
exports.getTaskAdviceNotificationMessage = getTaskAdviceNotificationMessage;
exports.getCommentMentionNotificationMessage = getCommentMentionNotificationMessage;
exports.getMotivationPushNotificationMessage = getMotivationPushNotificationMessage;
exports.getTaskCheerNotificationMessage = getTaskCheerNotificationMessage;
exports.getTaskCheerPushText = getTaskCheerPushText;
exports.getNotificationMarkerMessage = getNotificationMarkerMessage;
exports.getReminderReceivedNotificationMessage = getReminderReceivedNotificationMessage;
exports.getFollowNotificationMessage = getFollowNotificationMessage;
exports.getFollowPushText = getFollowPushText;
exports.getTaskAdvicePushText = getTaskAdvicePushText;
exports.getReferralShareText = getReferralShareText;
exports.getReferralInviteText = getReferralInviteText;
exports.DEFAULT_TEST_NOTIFICATION_TEXT = {
    title: "🔔 Debug Test",
    body: "This is a test push notification!",
};
function getTestNotificationText() {
    return exports.DEFAULT_TEST_NOTIFICATION_TEXT;
}
function getMotivationMilestoneNotificationText(pushCount) {
    return {
        title: "🔥 Momentum milestone!",
        body: `Your task just passed ${pushCount} pushes. Keep it going.`,
    };
}
// Sent to earlier pushers when a goal they pushed crosses a push milestone.
function getPushedTaskMilestoneNotificationText(pushCount) {
    return {
        title: "🔥 Your push is paying off",
        body: `${pushCount} people have now pushed the goal you pushed.`,
    };
}
// Inbox message for the same event — includes the goal text for context.
function getPushedTaskMilestoneNotificationMessage(pushCount, taskText) {
    return `${pushCount} people have now pushed "${taskText}"`;
}
function getMotivationPushNotificationText(taskText) {
    return {
        title: "💪 You got a push",
        body: `Someone pushed you: "${taskText}"`,
    };
}
function getProgressUpdateNotificationText(taskText, senderName) {
    return {
        title: "📈 New update",
        body: `${senderName} shared an update on "${taskText}"`,
    };
}
// TODO: not aligned with push-only. "Reminder" is no longer a feature. Update or remove.
function getTaskReminderPushNotificationText(taskText) {
    return {
        title: "⏰ Reminder",
        body: `It's time: "${taskText}"`,
    };
}
// TODO: not aligned with push-only. The advice/decision/reminder branches are dead; simplify to push only.
function getHelperNotificationText(taskType, taskText) {
    const typeLabelMap = {
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
function getReminderNoteNotificationText(message) {
    return {
        title: "⏰ You got a reminder!",
        body: message,
    };
}
function getHelpPushReminderNotificationText(taskCount) {
    return {
        title: "Someone could use a push today",
        body: taskCount === 1
            ? "One task is waiting for your push."
            : `${taskCount} tasks are waiting for your push.`,
    };
}
function getUnfinishedMotivationReminderText(taskText) {
    return {
        title: "Keep going",
        body: `Your task "${taskText}" is still waiting.`,
    };
}
// TODO: not aligned with push-only. "Decision" is no longer a feature. Update or remove.
function getDecisionFinalizedNotificationText() {
    return {
        title: "✅ Decision Finalized",
        body: "A decision you helped with is complete.",
    };
}
function getCommentMentionPushText(commentText) {
    return {
        title: "💬 You were mentioned",
        body: `${commentText.slice(0, 50)}...`,
    };
}
function getTaskHelperNotificationMessage() {
    return "asked you to push them";
}
function getTaskProgressUpdateNotificationMessage(senderName) {
    return `${senderName} shared an update on your task.`;
}
// TODO: not aligned with push-only. "Decision" is no longer a feature. Update or remove.
function getDecisionDoneNotificationMessage(taskText) {
    return `marked the decision “${taskText}” as done.`;
}
// TODO: not aligned with push-only. "Advice" is no longer a feature. Update or remove.
function getTaskAdviceNotificationMessage() {
    return "gave advice on your task";
}
function getCommentMentionNotificationMessage() {
    return "mentioned you in a comment";
}
function getMotivationPushNotificationMessage() {
    return "pushed you 💪";
}
function getTaskCheerNotificationMessage(senderName, beatType, otherCount = 0) {
    const target = beatType === "update" ? "update" : "task";
    if (otherCount > 0) {
        const otherLabel = otherCount === 1 ? "other" : "others";
        return `${senderName} and ${otherCount} ${otherLabel} cheered your ${target}`;
    }
    return `${senderName} cheered your ${target}`;
}
function getTaskCheerPushText(senderName, beatType, otherCount = 0) {
    return {
        title: "PushMeUp",
        body: getTaskCheerNotificationMessage(senderName, beatType, otherCount),
    };
}
function getNotificationMarkerMessage() {
    return "milestone reached";
}
// TODO: not aligned with push-only. "Reminder" is no longer a feature. Update or remove.
function getReminderReceivedNotificationMessage(senderName) {
    return `${senderName} reminded you about your task.`;
}
function getFollowNotificationMessage(followerName) {
    return `${followerName} followed you`;
}
function getFollowPushText(followerName) {
    return {
        title: "🎉 New follower",
        body: `${followerName} started following you`,
    };
}
function getTaskAdvicePushText(taskText) {
    return {
        title: "💡 New advice on your goal",
        body: `Someone shared advice on "${taskText}"`,
    };
}
function getReferralShareText() {
    return {
        title: "Invite to PushMeUp",
        message: "Join me on PushMeUp. Post a goal and get real pushes from people who want you to win.",
    };
}
function getReferralInviteText() {
    return {
        title: "Invite to PushMeUp",
        body: "Join me on PushMeUp. Post a goal and get real pushes from people who want you to win.",
    };
}
