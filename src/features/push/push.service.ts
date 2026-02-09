import { createMotivationMilestoneNotification, createMotivationPushNotification } from "../notification/notification.service";
import { prisma } from "../../db/client";

type TogglePushInput = {
  userId: string;
  taskId: string;
};

// 💪 Toggle push for a motivation task
export async function togglePushForTask({
  userId,
  taskId,
}: TogglePushInput) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true, type: true },
  });

  if (!task || task.type !== "motivation") {
    throw new Error("Task not found or is not a motivation type");
  }

  const existing = await prisma.push.findUnique({
    where: {
      userId_taskId: { userId, taskId },
    },
  });

  let hasPushed: boolean;
  let pushCount: number;

  if (existing) {
    // 👎 Removing a push → NO notifications
    await prisma.push.delete({
      where: { id: existing.id },
    });

    pushCount = await prisma.push.count({ where: { taskId } });
    hasPushed = false;
  } else {
    // 👍 Adding a push
    await prisma.push.create({
      data: { userId, taskId },
    });

    pushCount = await prisma.push.count({ where: { taskId } });
    hasPushed = true;

    // 🔔 Normal motivation push notification
    await createMotivationPushNotification({
      taskId,
      taskOwnerId: task.userId,
      pushedByUserId: userId,
    });

    // 🔥 Milestone check
    await createMotivationMilestoneNotification({
      taskId,
      taskOwnerId: task.userId,
    pushCount: 10, // 👈 force milestone
    });
  }

  return {
    hasPushed,
    pushCount,
  };
}

// 📊 Get all pushes for a task (optional, mirrors getVotesForTask)
export async function getPushesForTask(
  taskId: string,
  userId: string,
) {
  const [pushCount, existing] = await Promise.all([
    prisma.push.count({
      where: { taskId },
    }),
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