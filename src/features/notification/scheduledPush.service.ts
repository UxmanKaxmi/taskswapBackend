import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { sendPushNotification } from "../../utils/sendPushNotification";

const DISPATCH_INTERVAL_MS = 60 * 1000;

let dispatchTimer: NodeJS.Timeout | null = null;
let dispatchRunning = false;

export async function createScheduledPush({
  userId,
  taskId,
  deliverAt,
  title,
  body,
  data,
}: {
  userId: string;
  taskId?: string;
  deliverAt: Date;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  return prisma.scheduledPush.create({
    data: {
      userId,
      taskId,
      deliverAt,
      title,
      body,
      data,
    },
  });
}

// Cancels every pending (unsent) scheduled push tied to a task. Used when a
// task is deleted or its reminder time changes.
export async function cancelScheduledPushesForTask(
  taskId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.scheduledPush.updateMany({
    where: {
      taskId,
      sentAt: null,
      canceledAt: null,
    },
    data: { canceledAt: new Date() },
  });
}

async function dispatchDuePush(push: {
  id: string;
  userId: string;
  taskId: string | null;
  title: string;
  body: string;
  data: Prisma.JsonValue;
}) {
  // Claim the row first so a concurrent dispatcher never double-sends.
  const { count } = await prisma.scheduledPush.updateMany({
    where: { id: push.id, sentAt: null, canceledAt: null },
    data: { sentAt: new Date() },
  });

  if (count === 0) return;

  // Skip pushes whose task no longer exists or is already completed.
  if (push.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: push.taskId },
      select: { completed: true },
    });

    if (!task || task.completed) {
      await prisma.scheduledPush.update({
        where: { id: push.id },
        data: { canceledAt: new Date() },
      });
      return;
    }
  }

  // Resolve the token at send time so token rotations between scheduling and
  // delivery still land on the right device.
  const user = await prisma.user.findUnique({
    where: { id: push.userId },
    select: { fcmToken: true },
  });

  if (!user?.fcmToken) return;

  const data =
    push.data && typeof push.data === "object" && !Array.isArray(push.data)
      ? Object.fromEntries(
          Object.entries(push.data as Record<string, unknown>).map(
            ([key, value]) => [key, String(value)]
          )
        )
      : undefined;

  await sendPushNotification(user.fcmToken, push.title, push.body, data);
}

export async function runScheduledPushDispatch() {
  if (dispatchRunning) return;
  dispatchRunning = true;

  try {
    const duePushes = await prisma.scheduledPush.findMany({
      where: {
        deliverAt: { lte: new Date() },
        sentAt: null,
        canceledAt: null,
      },
      orderBy: { deliverAt: "asc" },
      select: {
        id: true,
        userId: true,
        taskId: true,
        title: true,
        body: true,
        data: true,
      },
    });

    for (const push of duePushes) {
      await dispatchDuePush(push);
    }
  } catch (error) {
    console.error("❌ Scheduled push dispatch failed", error);
  } finally {
    dispatchRunning = false;
  }
}

export function startScheduledPushDispatcher() {
  if (dispatchTimer) return;

  // Run once at boot so pushes that came due while the server was down (or
  // mid-deploy) still go out.
  void runScheduledPushDispatch();

  dispatchTimer = setInterval(() => {
    void runScheduledPushDispatch();
  }, DISPATCH_INTERVAL_MS);

  dispatchTimer.unref?.();
}
