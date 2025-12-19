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
    select: { type: true },
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

  if (existing) {
    await prisma.push.delete({
      where: { id: existing.id },
    });
    hasPushed = false;
  } else {
    await prisma.push.create({
      data: { userId, taskId },
    });
    hasPushed = true;
  }

  const pushCount = await prisma.push.count({
    where: { taskId },
  });

  return {
    hasPushed,   // ✅ correct key
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