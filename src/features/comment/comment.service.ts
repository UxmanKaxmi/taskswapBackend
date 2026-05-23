import { schedulePush } from "../../utils/scheduleReminderPush";
import { prisma } from "../../db/client";
import { CreateCommentInput } from "./comment.types";
import {
  createCommentMentionNotifications,
  createTaskAdviceNotification,
} from "../notification/notification.service";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { USER_ORIGIN } from "../seededUser/seededUser.service";

export async function createComment(input: CreateCommentInput) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Create comment
    const comment = await tx.comment.create({
      data: {
        text: input.text,
        taskId: input.taskId,
        userId: input.userId,
      },
    });

    // 2️⃣ Advice notification (task owner)
    await createTaskAdviceNotification(tx, {
      taskId: input.taskId,
      senderId: input.userId,
      commentText: input.text,
    });

    // 3️⃣ Mention notifications
    const mentionedIds = (input.mentions ?? []).filter(
      (id) => id !== input.userId
    );

    if (mentionedIds.length) {
      await createCommentMentionNotifications(tx, {
        mentionedIds,
        senderId: input.userId,
        taskId: input.taskId,
        commentId: comment.id,
        commentText: input.text,
      });

      // 🔔 Push notifications (non-transactional on purpose)
      const recipients = await tx.user.findMany({
        where: { id: { in: mentionedIds }, origin: USER_ORIGIN.REAL },
        select: { fcmToken: true },
      });

      await Promise.all(
        recipients
          .filter((u) => !!u.fcmToken)
          .map((u) =>
            schedulePush(
              0,
              u.fcmToken!,
              "💬 You were mentioned",
              `${input.text.slice(0, 50)}...`,
              {
                notificationType: NOTIFICATION_TYPES.COMMENT,
                taskId: input.taskId,
                commentId: comment.id,
                screen: "TaskDetail",
                deeplinkPath: `/tasks/${input.taskId}`,
              }
            )
          )
      );
    }

    return comment;
  });
}


export async function getCommentsForTask(taskId: string, viewerId: string | null) {
  const comments = await prisma.comment.findMany({
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

export async function toggleCommentLike(
  commentId: string,
  userId: string,
  like: boolean
) {
  if (like) {
    return prisma.commentLike.upsert({
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
  } else {
    return prisma.commentLike.deleteMany({
      where: {
        commentId,
        userId,
      },
    });
  }
}
