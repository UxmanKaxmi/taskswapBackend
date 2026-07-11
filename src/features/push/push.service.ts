import { createMotivationMilestoneNotification, createMotivationPushNotification, sendMotivationPushSilentNotification } from "../notification/notification.service";
import { prisma } from "../../db/client";
import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { isTaskHiddenForViewer } from "../moderation/moderation.service";
import { completeFirstTimeHint } from "../hints/hints.service";

type TogglePushInput = {
  userId: string;
  taskId: string;
};

// 💪 Create a push for a motivation task. Repeated calls are idempotent.
export async function togglePushForTask({
  userId,
  taskId,
}: TogglePushInput) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true, type: true, createdAt: true, completed: true },
  });

  if (!task || task.type !== "motivation") {
    throw new AppError(
      "Task not found or is not a motivation type",
      HttpStatus.NOT_FOUND
    );
  }

  if (task.userId === userId) {
    throw new AppError("You cannot push your own task", HttpStatus.FORBIDDEN);
  }

  if (await isTaskHiddenForViewer(task.userId, userId)) {
    throw new AppError("This task is unavailable.", HttpStatus.FORBIDDEN);
  }

  if (task.completed) {
    throw new AppError(
      "Completed tasks cannot receive pushes",
      HttpStatus.CONFLICT
    );
  }

  const existing = await prisma.push.findUnique({
    where: {
      userId_taskId: { userId, taskId },
    },
  });

  if (existing) {
    const pushCount = await prisma.push.count({
      where: { taskId, userId: { not: task.userId } },
    });
    return {
      hasPushed: true,
      pushCount,
    };
  }

  let pushCount: number;

  try {
    const pushedAt = new Date();
    pushCount = await prisma.$transaction(async (tx) => {
      const push = await tx.push.create({
        data: { userId, taskId, createdAt: pushedAt },
        select: { createdAt: true },
      });

      const nextCount = await tx.push.count({
        where: { taskId, userId: { not: task.userId } },
      });

      await tx.task.update({
        where: { id: taskId },
        data: {
          pushCount: nextCount,
          latestActivityAt: push.createdAt,
          isAlmostThere: nextCount >= 3,
        },
      });

      return nextCount;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      pushCount = await prisma.push.count({
        where: { taskId, userId: { not: task.userId } },
      });
      return {
        hasPushed: true,
        pushCount,
      };
    }

    throw error;
  }

  // Only the create path lands here, so this is the pusher's first-ever push
  // or a no-op; the early "already pushed" returns above never reach it.
  await completeFirstTimeHint(userId, "first_push_given");

  await createMotivationPushNotification({
    taskId,
    taskOwnerId: task.userId,
    pushedByUserId: userId,
  });

  // Live "X pushed you" pill for the owner. Fire-and-forget: a failed silent
  // push must never fail the push request itself.
  void sendMotivationPushSilentNotification({
    taskId,
    taskOwnerId: task.userId,
    pushedByUserId: userId,
    pushCount,
  }).catch((error) => {
    console.error("Failed to send push-received silent notification:", error);
  });

  await createMotivationMilestoneNotification({
    taskId,
    taskOwnerId: task.userId,
    pushCount,
    triggeredByUserId: userId,
  });

  return {
    hasPushed: true,
    pushCount,
  };
}

// 📊 Get all pushes for a task (optional, mirrors getVotesForTask)
export async function getPushesForTask(
  taskId: string,
  userId: string,
) {
  const [pushCount, existing] = await Promise.all([
    prisma.task
      .findUnique({
        where: { id: taskId },
        select: { userId: true },
      })
      .then((task) =>
        prisma.push.count({
          where: {
            taskId,
            ...(task ? { userId: { not: task.userId } } : {}),
          },
        })
      ),
    prisma.push.findUnique({
      where: {
        userId_taskId: { userId, taskId },
      },
    }),
  ]);

  return {
    hasPushed: !!existing,
    pushCount,
  };
}
