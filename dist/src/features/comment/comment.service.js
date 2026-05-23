"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComment = createComment;
exports.getCommentsForTask = getCommentsForTask;
exports.toggleCommentLike = toggleCommentLike;
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const client_1 = require("../../db/client");
const notification_service_1 = require("../notification/notification.service");
const notificationTypes_1 = require("../../types/notificationTypes");
const seededUser_service_1 = require("../seededUser/seededUser.service");
async function createComment(input) {
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
                where: { id: { in: mentionedIds }, origin: seededUser_service_1.USER_ORIGIN.REAL },
                select: { fcmToken: true },
            });
            await Promise.all(recipients
                .filter((u) => !!u.fcmToken)
                .map((u) => (0, scheduleReminderPush_1.schedulePush)(0, u.fcmToken, "💬 You were mentioned", `${input.text.slice(0, 50)}...`, {
                notificationType: notificationTypes_1.NOTIFICATION_TYPES.COMMENT,
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
    const comments = await client_1.prisma.comment.findMany({
        where: { taskId },
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
