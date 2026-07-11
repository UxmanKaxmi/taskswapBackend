"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComment = createComment;
exports.getCommentsForTask = getCommentsForTask;
exports.toggleCommentLike = toggleCommentLike;
const sendPushNotification_1 = require("../../utils/sendPushNotification");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notification/notification.service");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
const AppError_1 = require("../../errors/AppError");
const httpStatus_1 = require("../../types/httpStatus");
const contentModeration_1 = require("../../utils/contentModeration");
const moderation_service_1 = require("../moderation/moderation.service");
const task_serializers_1 = require("../task/task.serializers");
const anonIdentity_1 = require("../../utils/anonIdentity");
async function createComment(input) {
    (0, contentModeration_1.assertPostableContent)([input.text]);
    const task = await client_1.prisma.task.findUnique({
        where: { id: input.taskId },
        select: { userId: true, isPublic: true },
    });
    if (!task || !task.isPublic) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (await (0, moderation_service_1.isTaskHiddenForViewer)(task.userId, input.userId)) {
        throw new AppError_1.AppError("This task is hidden.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    const mentionedIds = (input.mentions ?? []).filter((id) => id !== input.userId);
    const { comment, advicePush } = await client_1.prisma.$transaction(async (tx) => {
        // 1️⃣ Create comment
        const createdComment = await tx.comment.create({
            data: {
                text: input.text,
                taskId: input.taskId,
                userId: input.userId,
            },
        });
        // 2️⃣ Advice notification (task owner)
        const adviceResult = await (0, notification_service_1.createTaskAdviceNotification)(tx, {
            taskId: input.taskId,
            senderId: input.userId,
            commentText: input.text,
        });
        // 3️⃣ Mention notifications
        if (mentionedIds.length) {
            await (0, notification_service_1.createCommentMentionNotifications)(tx, {
                mentionedIds,
                senderId: input.userId,
                taskId: input.taskId,
                commentId: createdComment.id,
                commentText: input.text,
            });
        }
        return { comment: createdComment, advicePush: adviceResult };
    });
    // 🔔 Pushes go out only after the transaction commits, so a rollback can
    // never leave users with a push for a comment that doesn't exist.
    if (mentionedIds.length) {
        const recipients = await client_1.prisma.user.findMany({
            where: { id: { in: mentionedIds }, fcmToken: { not: null } },
            select: { fcmToken: true },
        });
        const commentMentionPushText = (0, notificationTextCatalog_1.getCommentMentionPushText)(input.text);
        await Promise.all(recipients.map((u) => (0, sendPushNotification_1.sendPushNotification)(u.fcmToken, commentMentionPushText.title, commentMentionPushText.body, {
            notificationType: "comment",
            taskId: input.taskId,
            commentId: comment.id,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${input.taskId}`,
        })));
    }
    if (advicePush) {
        const owner = await client_1.prisma.user.findUnique({
            where: { id: advicePush.ownerId },
            select: { fcmToken: true },
        });
        if (owner?.fcmToken) {
            const advicePushText = (0, notificationTextCatalog_1.getTaskAdvicePushText)(advicePush.taskText);
            await (0, sendPushNotification_1.sendPushNotification)(owner.fcmToken, advicePushText.title, advicePushText.body, {
                notificationType: "task-advice",
                taskId: input.taskId,
                taskType: "advice",
                commentId: comment.id,
                screen: "TaskDetail",
                deeplinkPath: `/tasks/${input.taskId}`,
            });
        }
    }
    return comment;
}
async function getCommentsForTask(taskId, viewerId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            isPublic: true,
            isAnonymous: true,
            anonAlias: true,
            anonAvatarColor: true,
        },
    });
    if (!task || !task.isPublic) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (await (0, moderation_service_1.isTaskHiddenForViewer)(task.userId, viewerId)) {
        throw new AppError_1.AppError("This task is hidden.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    const blockedUserIds = await (0, moderation_service_1.getBlockedUserIdsForViewer)(viewerId);
    const comments = await client_1.prisma.comment.findMany({
        where: {
            taskId,
            userId: blockedUserIds.length > 0 ? { notIn: blockedUserIds } : undefined,
        },
        orderBy: { createdAt: "desc" },
        include: {
            user: { select: { id: true, name: true, photo: true } },
            likes: true,
        },
    });
    // On an anonymous goal, the owner's own comments must carry the alias too —
    // a named reply from the owner would defeat the anonymity. Supporters'
    // comments stay fully named.
    const maskOwner = (0, task_serializers_1.isMaskedForViewer)(task, viewerId);
    return comments.map((c) => {
        const masked = maskOwner && c.userId === task.userId;
        return {
            id: c.id,
            text: c.text,
            taskId: c.taskId,
            userId: masked ? (0, anonIdentity_1.anonOwnerId)(task.id) : c.userId,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt?.toISOString(),
            user: masked
                ? {
                    id: (0, anonIdentity_1.anonOwnerId)(task.id),
                    name: task.anonAlias ?? "Anonymous",
                    photo: null,
                }
                : c.user,
            likesCount: c.likes.length,
            likedByMe: viewerId ? c.likes.some((like) => like.userId === viewerId) : false, // ⭐ public safe
        };
    });
}
async function toggleCommentLike(commentId, userId, like) {
    if (like) {
        return client_1.prisma.commentLike.upsert({
            where: {
                commentId_userId: {
                    commentId,
                    userId,
                },
            },
            update: {},
            create: {
                commentId,
                userId,
            },
        });
    }
    else {
        return client_1.prisma.commentLike.deleteMany({
            where: {
                commentId,
                userId,
            },
        });
    }
}
