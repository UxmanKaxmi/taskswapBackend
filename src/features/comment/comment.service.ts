import { sendPushNotification } from "../../utils/sendPushNotification";
import { prisma } from "../../db/client";
import { CreateCommentInput } from "./comment.types";
import {
  createCommentMentionNotifications,
  createTaskAdviceNotification,
} from "../notification/notification.service";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import {
  getCommentMentionPushText,
  getTaskAdvicePushText,
} from "../../utils/notificationTextCatalog";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { assertPostableContent } from "../../utils/contentModeration";
import {
  getBlockedUserIdsForViewer,
  isTaskHiddenForViewer,
} from "../moderation/moderation.service";
import { isMaskedForViewer } from "../task/task.serializers";
import { anonOwnerId } from "../../utils/anonIdentity";

export async function createComment(input: CreateCommentInput) {
  assertPostableContent([input.text]);

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { userId: true, isPublic: true },
  });

  if (!task || !task.isPublic) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (await isTaskHiddenForViewer(task.userId, input.userId)) {
    throw new AppError("This task is hidden.", HttpStatus.NOT_FOUND);
  }

  const mentionedIds = (input.mentions ?? []).filter(
    (id) => id !== input.userId
  );

  const { comment, advicePush } = await prisma.$transaction(async (tx) => {
    // 1️⃣ Create comment
    const createdComment = await tx.comment.create({
      data: {
        text: input.text,
        taskId: input.taskId,
        userId: input.userId,
      },
    });

    // 2️⃣ Advice notification (task owner)
    const adviceResult = await createTaskAdviceNotification(tx, {
      taskId: input.taskId,
      senderId: input.userId,
      commentText: input.text,
    });

    // 3️⃣ Mention notifications
    if (mentionedIds.length) {
      await createCommentMentionNotifications(tx, {
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
    const recipients = await prisma.user.findMany({
      where: { id: { in: mentionedIds }, fcmToken: { not: null } },
      select: { fcmToken: true },
    });
    const commentMentionPushText = getCommentMentionPushText(input.text);

    await Promise.all(
      recipients.map((u) =>
        sendPushNotification(
          u.fcmToken!,
          commentMentionPushText.title,
          commentMentionPushText.body,
          {
            notificationType: "comment",
            taskId: input.taskId,
            commentId: comment.id,
            screen: "TaskDetail",
            deeplinkPath: `/tasks/${input.taskId}`,
          }
        )
      )
    );
  }

  if (advicePush) {
    const owner = await prisma.user.findUnique({
      where: { id: advicePush.ownerId },
      select: { fcmToken: true },
    });

    if (owner?.fcmToken) {
      const advicePushText = getTaskAdvicePushText(advicePush.taskText);
      await sendPushNotification(owner.fcmToken, advicePushText.title, advicePushText.body, {
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


export async function getCommentsForTask(taskId: string, viewerId: string | null) {
  const task = await prisma.task.findUnique({
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
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (await isTaskHiddenForViewer(task.userId, viewerId)) {
    throw new AppError("This task is hidden.", HttpStatus.NOT_FOUND);
  }

  const blockedUserIds = await getBlockedUserIdsForViewer(viewerId);
  const comments = await prisma.comment.findMany({
    where: {
      taskId,
      userId:
        blockedUserIds.length > 0 ? { notIn: blockedUserIds } : undefined,
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
  const maskOwner = isMaskedForViewer(task, viewerId);

  return comments.map((c) => {
    const masked = maskOwner && c.userId === task.userId;

    return {
      id: c.id,
      text: c.text,
      taskId: c.taskId,
      userId: masked ? anonOwnerId(task.id) : c.userId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt?.toISOString(),
      user: masked
        ? {
            id: anonOwnerId(task.id),
            name: task.anonAlias ?? "Anonymous",
            photo: null,
          }
        : c.user,
      likesCount: c.likes.length,
      likedByMe: viewerId ? c.likes.some((like) => like.userId === viewerId) : false, // ⭐ public safe
    };
  });
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
