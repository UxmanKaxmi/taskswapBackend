"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComment = createComment;
exports.getCommentsForTask = getCommentsForTask;
exports.toggleCommentLike = toggleCommentLike;
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notification/notification.service");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
const AppError_1 = require("../../errors/AppError");
const httpStatus_1 = require("../../types/httpStatus");
const contentModeration_1 = require("../../utils/contentModeration");
const moderation_service_1 = require("../moderation/moderation.service");
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
    return client_1.prisma.$transaction(async (tx) => {
        // 1️⃣ Create comment
        const comment = await tx.comment.create({
            data: {
                text: input.text,
                taskId: input.taskId,
                userId: input.userId,
            },
        });
        // 2️⃣ Advice notification (task owner)
        await (0, notification_service_1.createTaskAdviceNotification)(tx, {
            taskId: input.taskId,
            senderId: input.userId,
            commentText: input.text,
        });
        // 3️⃣ Mention notifications
        const mentionedIds = (input.mentions ?? []).filter((id) => id !== input.userId);
        if (mentionedIds.length) {
            await (0, notification_service_1.createCommentMentionNotifications)(tx, {
                mentionedIds,
                senderId: input.userId,
                taskId: input.taskId,
                commentId: comment.id,
                commentText: input.text,
            });
            // 🔔 Push notifications (non-transactional on purpose)
            const recipients = await tx.user.findMany({
                where: { id: { in: mentionedIds } },
                select: { fcmToken: true },
            });
            const commentMentionPushText = (0, notificationTextCatalog_1.getCommentMentionPushText)(input.text);
            await Promise.all(recipients
                .filter((u) => !!u.fcmToken)
                .map((u) => (0, scheduleReminderPush_1.schedulePush)(0, u.fcmToken, commentMentionPushText.title, commentMentionPushText.body, {
                notificationType: "comment",
                taskId: input.taskId,
                commentId: comment.id,
                screen: "TaskDetail",
                deeplinkPath: `/tasks/${input.taskId}`,
            })));
        }
        return comment;
    });
}
async function getCommentsForTask(taskId, viewerId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { userId: true, isPublic: true },
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
    return comments.map((c) => ({
        id: c.id,
        text: c.text,
        taskId: c.taskId,
        userId: c.userId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt?.toISOString(),
        user: c.user,
        likesCount: c.likes.length,
        likedByMe: viewerId ? c.likes.some((like) => like.userId === viewerId) : false, // ⭐ public safe
    }));
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
