"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComment = createComment;
exports.getCommentsForTask = getCommentsForTask;
exports.toggleCommentLike = toggleCommentLike;
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notification/notification.service");
async function createComment(input) {
    // wrap in a transaction so comment + notifications stay consistent
    return client_1.prisma.$transaction(async (tx) => {
        const comment = await tx.comment.create({
            data: {
                text: input.text,
                taskId: input.taskId,
                userId: input.userId,
            },
        });
        const mentionedIds = (input.mentions ?? []).filter((id) => id !== input.userId); // don't notify self
        if (mentionedIds.length) {
            // create in-app notifications
            await (0, notification_service_1.createCommentMentionNotifications)({
                mentionedIds,
                senderId: input.userId,
                taskId: input.taskId,
                commentId: comment.id,
                commentText: input.text,
            });
            // optional: push notifications
            const recipients = await tx.user.findMany({
                where: { id: { in: mentionedIds } },
                select: { fcmToken: true },
            });
            await Promise.all(recipients
                .filter((u) => !!u.fcmToken)
                .map((u) => (0, scheduleReminderPush_1.schedulePush)(0, u.fcmToken, "💬 You were mentioned", `${input.text.slice(0, 50)}...`)));
        }
        return comment;
    });
}
async function getCommentsForTask(taskId, userId) {
    const comments = await client_1.prisma.comment.findMany({
        where: { taskId },
        orderBy: { createdAt: "desc" },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    photo: true,
                },
            },
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
        likedByMe: c.likes.some((like) => like.userId === userId),
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
