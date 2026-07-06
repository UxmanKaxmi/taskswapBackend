import { prisma } from "../../db/client";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { sendPushNotification } from "../../utils/sendPushNotification";
import {
  getHelpPushReminderNotificationText,
  getUnfinishedMotivationReminderText,
} from "../../utils/notificationTextCatalog";
import { USER_ORIGIN } from "../seededUser/seededUser.service";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const SWEEP_INTERVAL_MS = HOUR_MS;
const UNFINISHED_REMINDER_AFTER_MS = DAY_MS;
const HELP_PUSH_REMINDER_AFTER_MS = 3 * DAY_MS;
const UNFINISHED_REMINDER_MAX_PER_TASK = 3;
const HELP_PUSH_REMINDER_MAX_PER_WEEK = 2;
const HELP_PUSH_REMINDER_COOLDOWN_MS = 4 * DAY_MS;
const MAX_UNFINISHED_PER_SWEEP = 3;
const MAX_HELP_PUSH_PER_SWEEP = 3;
const MAX_CANDIDATES_PER_SWEEP = 200;
const SWEEP_SEND_SPACING_MS = 2 * 60 * 1000;
const SWEEP_SEND_JITTER_MS = 90 * 1000;

// DB-backed lease so concurrent server instances never run the sweep twice.
const SWEEP_LOCK_NAME = "notification-reminder-sweep";
const SWEEP_LOCK_LEASE_MS = 30 * 60 * 1000;

let sweepRunning = false;
let sweepTimer: NodeJS.Timeout | null = null;

async function acquireSweepLock(): Promise<boolean> {
  await prisma.jobLock.createMany({
    data: [{ name: SWEEP_LOCK_NAME, lockedAt: new Date(0) }],
    skipDuplicates: true,
  });

  const { count } = await prisma.jobLock.updateMany({
    where: {
      name: SWEEP_LOCK_NAME,
      lockedAt: { lt: new Date(Date.now() - SWEEP_LOCK_LEASE_MS) },
    },
    data: { lockedAt: new Date() },
  });

  return count === 1;
}

async function releaseSweepLock() {
  await prisma.jobLock.updateMany({
    where: { name: SWEEP_LOCK_NAME },
    data: { lockedAt: new Date(0) },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(values: T[]) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

async function spaceOutNextSend() {
  await sleep(SWEEP_SEND_SPACING_MS + randomInt(0, SWEEP_SEND_JITTER_MS));
}

function buildTaskMetadata(taskId: string, taskText: string) {
  return {
    taskId,
    taskText,
  };
}

function buildInactivityNotificationWhere(userId: string, taskId: string) {
  return {
    userId,
    type: NOTIFICATION_TYPES.TASK_MOTIVATION_UNFINISHED_REMINDER,
    metadata: {
      path: ["taskId"],
      equals: taskId,
    },
  };
}

async function sendUnfinishedMotivationReminder(user: {
  id: string;
  fcmToken: string | null;
  name: string;
}, task: {
  id: string;
  text: string;
}) {
  const { title, body } = getUnfinishedMotivationReminderText(task.text);

  await prisma.notification.create({
    data: {
      userId: user.id,
      senderId: null,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_UNFINISHED_REMINDER,
      taskType: "motivation",
      message: body,
      metadata: buildTaskMetadata(task.id, task.text),
    },
  });

  if (user.fcmToken) {
    await sendPushNotification(user.fcmToken, title, body, {
      notificationType: NOTIFICATION_TYPES.TASK_MOTIVATION_UNFINISHED_REMINDER,
      taskId: task.id,
      taskType: "motivation",
      screen: "TaskDetail",
      deeplinkPath: `/tasks/${task.id}`,
    });
  }
}

async function sendHelpPushReminder(user: {
  id: string;
  fcmToken: string | null;
}, taskCount: number) {
  const { title, body } = getHelpPushReminderNotificationText(taskCount);

  await prisma.notification.create({
    data: {
      userId: user.id,
      senderId: null,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
      taskType: "motivation",
      message: body,
      metadata: {
        taskCount,
      },
    },
  });

  if (user.fcmToken) {
    await sendPushNotification(user.fcmToken, title, body, {
      notificationType: NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
      taskType: "motivation",
      screen: "Home",
      deeplinkPath: "/",
    });
  }
}

async function maybeSendUnfinishedMotivationReminder(user: {
  id: string;
  fcmToken: string | null;
  lastOpenedAt: Date | null;
  name: string;
}): Promise<boolean> {
  if (!user.lastOpenedAt) return false;

  const inactivityMs = Date.now() - user.lastOpenedAt.getTime();
  if (inactivityMs < UNFINISHED_REMINDER_AFTER_MS) return false;

  const activeTasks = await prisma.task.findMany({
    where: {
      userId: user.id,
      type: "motivation",
      completed: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
    },
  });

  for (const task of activeTasks) {
    const where = buildInactivityNotificationWhere(user.id, task.id);
    const sentCount = await prisma.notification.count({ where });

    if (sentCount >= UNFINISHED_REMINDER_MAX_PER_TASK) {
      continue;
    }

    const lastSent = await prisma.notification.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (lastSent && Date.now() - lastSent.createdAt.getTime() < DAY_MS) {
      continue;
    }

    await sendUnfinishedMotivationReminder(user, task);
    return true;
  }

  return false;
}

async function maybeSendHelpPushReminder(user: {
  id: string;
  fcmToken: string | null;
  lastOpenedAt: Date | null;
}): Promise<boolean> {
  if (!user.lastOpenedAt) return false;

  const inactivityMs = Date.now() - user.lastOpenedAt.getTime();
  if (inactivityMs < HELP_PUSH_REMINDER_AFTER_MS) return false;

  const reminderCount = await prisma.notification.count({
    where: {
      userId: user.id,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
      createdAt: {
        gte: new Date(Date.now() - WEEK_MS),
      },
    },
  });

  if (reminderCount >= HELP_PUSH_REMINDER_MAX_PER_WEEK) return false;

  const lastSent = await prisma.notification.findFirst({
    where: {
      userId: user.id,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastSent && Date.now() - lastSent.createdAt.getTime() < HELP_PUSH_REMINDER_COOLDOWN_MS) {
    return false;
  }

  const followedUserIds = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });

  if (!followedUserIds.length) return false;

  const taskCount = await prisma.task.count({
    where: {
      type: "motivation",
      completed: false,
      userId: { in: followedUserIds.map((row) => row.followingId) },
      Push: {
        none: {},
      },
    },
  });

  if (!taskCount) return false;

  await sendHelpPushReminder(user, taskCount);
  return true;
}

export async function runNotificationReminderSweep() {
  if (sweepRunning) return;
  sweepRunning = true;

  let lockAcquired = false;

  try {
    lockAcquired = await acquireSweepLock();
    if (!lockAcquired) return;

    const unfinishedCutoff = new Date(Date.now() - UNFINISHED_REMINDER_AFTER_MS);
    const helpPushCutoff = new Date(Date.now() - HELP_PUSH_REMINDER_AFTER_MS);

    const unfinishedUsers = await prisma.user.findMany({
      where: {
        origin: USER_ORIGIN.REAL,
        lastOpenedAt: {
          not: null,
          lt: unfinishedCutoff,
        },
      },
      select: {
        id: true,
        name: true,
        fcmToken: true,
        lastOpenedAt: true,
      },
      orderBy: {
        lastOpenedAt: "asc",
      },
      take: MAX_CANDIDATES_PER_SWEEP,
    });

    const helpPushUsers = await prisma.user.findMany({
      where: {
        origin: USER_ORIGIN.REAL,
        lastOpenedAt: {
          not: null,
          lt: helpPushCutoff,
        },
      },
      select: {
        id: true,
        name: true,
        fcmToken: true,
        lastOpenedAt: true,
      },
      orderBy: {
        lastOpenedAt: "asc",
      },
      take: MAX_CANDIDATES_PER_SWEEP,
    });

    // Shuffle the full candidate pool and keep trying until the send quota is
    // met. Candidates who are capped out (or have nothing to be reminded
    // about) no longer block everyone behind them.
    let unfinishedSent = 0;
    for (const user of shuffle(unfinishedUsers)) {
      if (unfinishedSent >= MAX_UNFINISHED_PER_SWEEP) break;

      const sent = await maybeSendUnfinishedMotivationReminder(user);
      if (sent) {
        unfinishedSent += 1;
        if (unfinishedSent < MAX_UNFINISHED_PER_SWEEP) await spaceOutNextSend();
      }
    }

    let helpPushSent = 0;
    for (const user of shuffle(helpPushUsers)) {
      if (helpPushSent >= MAX_HELP_PUSH_PER_SWEEP) break;

      const sent = await maybeSendHelpPushReminder(user);
      if (sent) {
        helpPushSent += 1;
        if (helpPushSent < MAX_HELP_PUSH_PER_SWEEP) await spaceOutNextSend();
      }
    }
  } catch (error) {
    console.error("❌ Reminder sweep failed", error);
  } finally {
    if (lockAcquired) {
      await releaseSweepLock().catch((error) =>
        console.error("❌ Failed to release sweep lock", error)
      );
    }
    sweepRunning = false;
  }
}

export function startNotificationReminderSweep() {
  if (sweepTimer) return;

  sweepTimer = setInterval(() => {
    void runNotificationReminderSweep();
  }, SWEEP_INTERVAL_MS);

  sweepTimer.unref?.();
}
