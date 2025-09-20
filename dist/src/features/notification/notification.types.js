"use strict";
// src/types/notification.types.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATION_TYPES = void 0;
// 1) Canonical type strings (camelCase)
exports.NOTIFICATION_TYPES = {
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
};
