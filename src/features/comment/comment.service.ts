import { schedulePush } from "../../utils/scheduleReminderPush";
import { prisma } from "../../db/client";
import { CreateCommentInput } from "./comment.types";
import { createCommentMentionNotifications } from "../notification/notification.service";

export async function createComment(input: CreateCommentInput) {
  // wrap in a transaction so comment + notifications stay consistent
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        text: input.text,
        taskId: input.taskId,
        userId: input.userId,
      },
    });

    const mentionedIds = (input.mentions ?? []).filter(
      (id) => id !== input.userId
    ); // don't notify self

    if (mentionedIds.length) {
      // create in-app notifications
      await createCommentMentionNotifications({
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
      await Promise.all(
        recipients
          .filter((u) => !!u.fcmToken)
          .map((u) =>
            schedulePush(
              0,
              u.fcmToken!,
              "💬 You were mentioned",
              `${input.text.slice(0, 50)}...`
            )
          )
      );
    }

    return comment;
  });
}

export async function getCommentsForTask(taskId: string, userId: string) {
  const comments = await prisma.comment.findMany({
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
