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
const MAX_UNFINISHED_CANDIDATES_PER_SWEEP = 15;
const MAX_HELP_PUSH_CANDIDATES_PER_SWEEP = 15;
const SWEEP_SEND_SPACING_MS = 2 * 60 * 1000;
const SWEEP_SEND_JITTER_MS = 90 * 1000;

let sweepRunning = false;
let sweepTimer: NodeJS.Timeout | null = null;

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

async function staggerNotification(index: number) {
  if (index === 0) return;

  const delayMs = (index * SWEEP_SEND_SPACING_MS) + randomInt(0, SWEEP_SEND_JITTER_MS);
  await sleep(delayMs);
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
}) {
  if (!user.lastOpenedAt) return;

  const inactivityMs = Date.now() - user.lastOpenedAt.getTime();
  if (inactivityMs < UNFINISHED_REMINDER_AFTER_MS) return;

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
    return;
  }
}

async function maybeSendHelpPushReminder(user: {
  id: string;
  fcmToken: string | null;
  lastOpenedAt: Date | null;
}) {
  if (!user.lastOpenedAt) return;

  const inactivityMs = Date.now() - user.lastOpenedAt.getTime();
  if (inactivityMs < HELP_PUSH_REMINDER_AFTER_MS) return;

  const reminderCount = await prisma.notification.count({
    where: {
      userId: user.id,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
      createdAt: {
        gte: new Date(Date.now() - WEEK_MS),
      },
    },
  });

  if (reminderCount >= HELP_PUSH_REMINDER_MAX_PER_WEEK) return;

  const lastSent = await prisma.notification.findFirst({
    where: {
      userId: user.id,
      type: NOTIFICATION_TYPES.TASK_MOTIVATION_HELP_PUSH_REMINDER,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastSent && Date.now() - lastSent.createdAt.getTime() < HELP_PUSH_REMINDER_COOLDOWN_MS) {
    return;
  }

  const followedUserIds = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });

  if (!followedUserIds.length) return;

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

  if (!taskCount) return;

  await sendHelpPushReminder(user, taskCount);
}

export async function runNotificationReminderSweep() {
  if (sweepRunning) return;
  sweepRunning = true;

  try {
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
    });

    const unfinishedBatch = shuffle(
      unfinishedUsers.slice(0, MAX_UNFINISHED_CANDIDATES_PER_SWEEP)
    ).slice(0, MAX_UNFINISHED_PER_SWEEP);

    const helpPushBatch = shuffle(
      helpPushUsers.slice(0, MAX_HELP_PUSH_CANDIDATES_PER_SWEEP)
    ).slice(0, MAX_HELP_PUSH_PER_SWEEP);

    for (const [index, user] of unfinishedBatch.entries()) {
      await staggerNotification(index);
      await maybeSendUnfinishedMotivationReminder(user);
    }

    for (const [index, user] of helpPushBatch.entries()) {
      await staggerNotification(index);
      await maybeSendHelpPushReminder(user);
    }
  } catch (error) {
    console.error("❌ Reminder sweep failed", error);
  } finally {
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
