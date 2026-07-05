import "../src/config/env";
import { prisma } from "../src/db/client";

type Stage = "initial" | "update1" | "final";

const stage = normalizeStage(getStageArg() ?? process.env.APP_STORE_SEED_STAGE);

const SCREENSHOT_USER_IDS = {
  hana: "appstore-hana-k",
  adnan: "appstore-adnan-r",
  sara: "appstore-sara-m",
};

const SCREENSHOT_TASK_IDS = {
  hanaRun: "appstore-task-hana-run",
  adnanProposal: "appstore-task-adnan-proposal",
  saraGrandmother: "appstore-task-sara-grandmother",
  invoice: "appstore-task-you-invoice",
};

const POST_BEAT_IDS = {
  hanaRun: "appstore-beat-hana-run-post",
  adnanProposal: "appstore-beat-adnan-proposal-post",
  saraGrandmother: "appstore-beat-sara-grandmother-post",
  invoice: "appstore-beat-you-invoice-post",
};

const HANA_UPDATE_ROWS = [
  {
    id: "appstore-update-hana-run-1",
    beatId: "appstore-beat-hana-run-update-1",
    text: "Ran 2km. Legs are jelly but I did it.",
    minutesAgo: 180,
  },
  {
    id: "appstore-update-hana-run-2",
    beatId: "appstore-beat-hana-run-update-2",
    text: "Week two. Three runs done. Still slow, still going.",
    minutesAgo: 120,
  },
  {
    id: "appstore-update-hana-run-3",
    beatId: "appstore-beat-hana-run-update-3",
    text: "Signed up for a 5k in October.",
    minutesAgo: 60,
  },
] as const;

const CHEER_PRESETS = {
  keepGoing: { key: "keep_going", text: "Keep going." },
  proudOfYou: { key: "proud_of_you", text: "Proud of you." },
  youGotThis: { key: "you_got_this", text: "You got this." },
  oneStep: { key: "one_step", text: "One step at a time." },
} as const;

const screenshotUsers = [
  {
    id: SCREENSHOT_USER_IDS.hana,
    email: "hana.k@appstore.taskswap.invalid",
    name: "Hana K.",
    username: "hana_k_appstore",
    avatarInitial: "H",
    avatarColor: "#059669",
  },
  {
    id: SCREENSHOT_USER_IDS.adnan,
    email: "adnan.r@appstore.taskswap.invalid",
    name: "Adnan R.",
    username: "adnan_r_appstore",
    avatarInitial: "A",
    avatarColor: "#2563EB",
  },
  {
    id: SCREENSHOT_USER_IDS.sara,
    email: "sara.m@appstore.taskswap.invalid",
    name: "Sara M.",
    username: "sara_m_appstore",
    avatarInitial: "S",
    avatarColor: "#D97706",
  },
];

function normalizeStage(value: string | undefined): Stage {
  if (value === "update1" || value === "final") return value;
  return "initial";
}

function getStageArg() {
  const stagePrefix = "--stage=";
  const stageWithEquals = process.argv.find((arg) => arg.startsWith(stagePrefix));
  if (stageWithEquals) return stageWithEquals.slice(stagePrefix.length);

  const stageFlagIndex = process.argv.indexOf("--stage");
  if (stageFlagIndex >= 0) return process.argv[stageFlagIndex + 1];

  return undefined;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function resolveViewer() {
  const requestedId = process.env.APP_STORE_SEED_USER_ID?.trim();
  const requestedEmail = process.env.APP_STORE_SEED_USER_EMAIL?.trim().toLowerCase();

  const requestedUser = requestedId
    ? await prisma.user.findUnique({ where: { id: requestedId } })
    : requestedEmail
    ? await prisma.user.findUnique({ where: { email: requestedEmail } })
    : null;

  if (requestedUser) return requestedUser;

  const preferredUser = await prisma.user.findFirst({
    where: {
      origin: "real",
      OR: [{ email: "kazmi58@gmail.com" }, { name: "Usman Kazmi" }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (preferredUser) return preferredUser;

  const latestRealUser = await prisma.user.findFirst({
    where: { origin: "real" },
    orderBy: { createdAt: "desc" },
  });

  if (latestRealUser) return latestRealUser;

  return prisma.user.upsert({
    where: { id: "appstore-you" },
    update: {
      email: "you@appstore.taskswap.invalid",
      name: "You",
      origin: "real",
      fcmToken: null,
    },
    create: {
      id: "appstore-you",
      email: "you@appstore.taskswap.invalid",
      name: "You",
      origin: "real",
      fcmToken: null,
    },
  });
}

async function resetScreenshotRows(viewerId: string) {
  const taskIds = Object.values(SCREENSHOT_TASK_IDS);
  const screenshotUserIds = Object.values(SCREENSHOT_USER_IDS);
  const notificationTaskClauses = taskIds.map((taskId) => ({
    metadata: { path: ["taskId"], equals: taskId },
  }));

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { userId: { in: screenshotUserIds } },
        { senderId: { in: screenshotUserIds } },
        ...notificationTaskClauses,
      ],
    },
  });

  await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: viewerId, followingId: { in: screenshotUserIds } },
        { followerId: { in: screenshotUserIds }, followingId: viewerId },
        { followerId: { in: screenshotUserIds }, followingId: { in: screenshotUserIds } },
      ],
    },
  });

  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.user.deleteMany({ where: { id: { in: screenshotUserIds } } });
}

async function ensureScreenshotUsers(viewerId: string) {
  for (const user of screenshotUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.name,
        username: user.username,
        photo: null,
        avatarInitial: user.avatarInitial,
        avatarColor: user.avatarColor,
        origin: "real",
        fcmToken: null,
      },
      create: {
        ...user,
        photo: null,
        origin: "real",
        fcmToken: null,
      },
    });

    await prisma.featureFlags.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }

  await prisma.featureFlags.upsert({
    where: { userId: viewerId },
    update: {},
    create: { userId: viewerId },
  });
}

async function ensureFollowGraph(viewerId: string) {
  await prisma.follow.createMany({
    data: [
      { followerId: viewerId, followingId: SCREENSHOT_USER_IDS.hana },
      { followerId: viewerId, followingId: SCREENSHOT_USER_IDS.adnan },
      { followerId: viewerId, followingId: SCREENSHOT_USER_IDS.sara },
      { followerId: SCREENSHOT_USER_IDS.hana, followingId: viewerId },
      { followerId: SCREENSHOT_USER_IDS.adnan, followingId: viewerId },
      { followerId: SCREENSHOT_USER_IDS.sara, followingId: viewerId },
    ],
    skipDuplicates: true,
  });
}

async function ensureTaskWithPostBeat({
  id,
  beatId,
  userId,
  name,
  text,
  feeling,
  createdAt,
}: {
  id: string;
  beatId: string;
  userId: string;
  name: string;
  text: string;
  feeling: "nervous" | "stuck" | "tired" | "overwhelmed";
  createdAt: Date;
}) {
  await prisma.task.upsert({
    where: { id },
    update: {
      text,
      type: "motivation",
      userId,
      name,
      avatar: "",
      feeling,
      completed: false,
      completedAt: null,
      isPublic: true,
      createdAt,
      latestActivityAt: createdAt,
    },
    create: {
      id,
      text,
      type: "motivation",
      userId,
      name,
      avatar: "",
      feeling,
      completed: false,
      completedAt: null,
      isPublic: true,
      createdAt,
      latestActivityAt: createdAt,
    },
  });

  await prisma.taskBeat.upsert({
    where: { id: beatId },
    update: {
      taskId: id,
      type: "post",
      updateId: null,
      createdAt,
    },
    create: {
      id: beatId,
      taskId: id,
      type: "post",
      createdAt,
    },
  });
}

async function ensureBaseTasks(viewer: { id: string; name: string; photo: string | null }) {
  await ensureTaskWithPostBeat({
    id: SCREENSHOT_TASK_IDS.hanaRun,
    beatId: POST_BEAT_IDS.hanaRun,
    userId: SCREENSHOT_USER_IDS.hana,
    name: "Hana K.",
    text: "Go for my first run in three weeks.",
    feeling: "nervous",
    createdAt: minutesAgo(90),
  });

  await ensureTaskWithPostBeat({
    id: SCREENSHOT_TASK_IDS.adnanProposal,
    beatId: POST_BEAT_IDS.adnanProposal,
    userId: SCREENSHOT_USER_IDS.adnan,
    name: "Adnan R.",
    text: "Finish the proposal I keep avoiding.",
    feeling: "stuck",
    createdAt: minutesAgo(150),
  });

  await ensureTaskWithPostBeat({
    id: SCREENSHOT_TASK_IDS.saraGrandmother,
    beatId: POST_BEAT_IDS.saraGrandmother,
    userId: SCREENSHOT_USER_IDS.sara,
    name: "Sara M.",
    text: "Call my grandmother back.",
    feeling: "overwhelmed",
    createdAt: minutesAgo(120),
  });

  await ensureTaskWithPostBeat({
    id: SCREENSHOT_TASK_IDS.invoice,
    beatId: POST_BEAT_IDS.invoice,
    userId: viewer.id,
    name: viewer.name || "You",
    text: "Send the invoice I have been sitting on for two weeks.",
    feeling: "tired",
    createdAt: minutesAgo(45),
  });
}

async function ensurePush({
  taskId,
  userId,
  createdAt,
  message,
}: {
  taskId: string;
  userId: string;
  createdAt: Date;
  message?: string;
}) {
  await prisma.push.upsert({
    where: { userId_taskId: { userId, taskId } },
    update: { source: "appstore", message, createdAt },
    create: { taskId, userId, source: "appstore", message, createdAt },
  });
}

async function updateTaskPushState(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });
  if (!task) return;

  const [pushCount, latestPush] = await Promise.all([
    prisma.push.count({ where: { taskId, userId: { not: task.userId } } }),
    prisma.push.findFirst({
      where: { taskId, userId: { not: task.userId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  await prisma.task.update({
    where: { id: taskId },
    data: {
      pushCount,
      isAlmostThere: pushCount >= 3,
      latestActivityAt: latestPush?.createdAt,
    },
  });
}

async function ensureCheer({
  id,
  taskId,
  beatId,
  userId,
  preset,
  createdAt,
}: {
  id: string;
  taskId: string;
  beatId: string;
  userId: string;
  preset: (typeof CHEER_PRESETS)[keyof typeof CHEER_PRESETS];
  createdAt: Date;
}) {
  await prisma.cheer.upsert({
    where: { beatId_userId: { beatId, userId } },
    update: {
      presetKey: preset.key,
      presetTextSnapshot: preset.text,
      createdAt,
    },
    create: {
      id,
      taskId,
      beatId,
      userId,
      presetKey: preset.key,
      presetTextSnapshot: preset.text,
      createdAt,
    },
  });
}

async function ensureNotification({
  id,
  userId,
  senderId,
  type,
  taskType = "motivation",
  message,
  taskId,
  taskText,
  beatId,
  createdAt,
}: {
  id: string;
  userId: string;
  senderId: string;
  type: "task-motivation-push" | "task-cheer";
  taskType?: string;
  message: string;
  taskId: string;
  taskText: string;
  beatId?: string;
  createdAt: Date;
}) {
  await prisma.notification.upsert({
    where: { id },
    update: {
      userId,
      senderId,
      type,
      taskType,
      message,
      read: false,
      metadata: {
        taskId,
        taskText,
        ...(beatId ? { beatId, notificationType: type } : {}),
      },
      createdAt,
    },
    create: {
      id,
      userId,
      senderId,
      type,
      taskType,
      message,
      read: false,
      metadata: {
        taskId,
        taskText,
        ...(beatId ? { beatId, notificationType: type } : {}),
      },
      createdAt,
    },
  });
}

async function ensureBaseSocialState(viewerId: string) {
  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    userId: SCREENSHOT_USER_IDS.adnan,
    createdAt: minutesAgo(80),
  });
  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    userId: SCREENSHOT_USER_IDS.sara,
    createdAt: minutesAgo(78),
  });
  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.saraGrandmother,
    userId: SCREENSHOT_USER_IDS.hana,
    createdAt: minutesAgo(100),
  });

  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.invoice,
    userId: SCREENSHOT_USER_IDS.hana,
    createdAt: minutesAgo(35),
  });
  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.invoice,
    userId: SCREENSHOT_USER_IDS.adnan,
    createdAt: minutesAgo(32),
  });
  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.invoice,
    userId: SCREENSHOT_USER_IDS.sara,
    createdAt: minutesAgo(29),
  });

  await Promise.all(Object.values(SCREENSHOT_TASK_IDS).map(updateTaskPushState));

  await ensureCheer({
    id: "appstore-cheer-invoice-hana",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    beatId: POST_BEAT_IDS.invoice,
    userId: SCREENSHOT_USER_IDS.hana,
    preset: CHEER_PRESETS.keepGoing,
    createdAt: minutesAgo(28),
  });
  await ensureCheer({
    id: "appstore-cheer-invoice-adnan",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    beatId: POST_BEAT_IDS.invoice,
    userId: SCREENSHOT_USER_IDS.adnan,
    preset: CHEER_PRESETS.proudOfYou,
    createdAt: minutesAgo(26),
  });
  await ensureCheer({
    id: "appstore-cheer-invoice-sara",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    beatId: POST_BEAT_IDS.invoice,
    userId: SCREENSHOT_USER_IDS.sara,
    preset: CHEER_PRESETS.oneStep,
    createdAt: minutesAgo(24),
  });

  const invoiceText = "Send the invoice I have been sitting on for two weeks.";
  await ensureNotification({
    id: "appstore-notification-invoice-push-hana",
    userId: viewerId,
    senderId: SCREENSHOT_USER_IDS.hana,
    type: "task-motivation-push",
    message: "pushed you 💪",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    taskText: invoiceText,
    createdAt: minutesAgo(35),
  });
  await ensureNotification({
    id: "appstore-notification-invoice-push-adnan",
    userId: viewerId,
    senderId: SCREENSHOT_USER_IDS.adnan,
    type: "task-motivation-push",
    message: "pushed you 💪",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    taskText: invoiceText,
    createdAt: minutesAgo(32),
  });
  await ensureNotification({
    id: "appstore-notification-invoice-push-sara",
    userId: viewerId,
    senderId: SCREENSHOT_USER_IDS.sara,
    type: "task-motivation-push",
    message: "pushed you 💪",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    taskText: invoiceText,
    createdAt: minutesAgo(29),
  });
  await ensureNotification({
    id: "appstore-notification-invoice-cheer-hana",
    userId: viewerId,
    senderId: SCREENSHOT_USER_IDS.hana,
    type: "task-cheer",
    message: "Hana K. cheered your task",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    taskText: invoiceText,
    beatId: POST_BEAT_IDS.invoice,
    createdAt: minutesAgo(28),
  });
  await ensureNotification({
    id: "appstore-notification-invoice-cheer-adnan",
    userId: viewerId,
    senderId: SCREENSHOT_USER_IDS.adnan,
    type: "task-cheer",
    message: "Adnan R. cheered your task",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    taskText: invoiceText,
    beatId: POST_BEAT_IDS.invoice,
    createdAt: minutesAgo(26),
  });
  await ensureNotification({
    id: "appstore-notification-invoice-cheer-sara",
    userId: viewerId,
    senderId: SCREENSHOT_USER_IDS.sara,
    type: "task-cheer",
    message: "Sara M. cheered your task",
    taskId: SCREENSHOT_TASK_IDS.invoice,
    taskText: invoiceText,
    beatId: POST_BEAT_IDS.invoice,
    createdAt: minutesAgo(24),
  });
}

async function ensureViewerCanCheerHana(viewerId: string) {
  await ensurePush({
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    userId: viewerId,
    message: CHEER_PRESETS.keepGoing.text,
    createdAt: minutesAgo(70),
  });
  await updateTaskPushState(SCREENSHOT_TASK_IDS.hanaRun);
}

async function setHanaProgressUpdateCount(count: number) {
  await prisma.progressUpdate.deleteMany({
    where: { taskId: SCREENSHOT_TASK_IDS.hanaRun },
  });

  const rows = HANA_UPDATE_ROWS.slice(0, count);
  for (const row of rows) {
    const createdAt = minutesAgo(row.minutesAgo);

    await prisma.progressUpdate.create({
      data: {
        id: row.id,
        taskId: SCREENSHOT_TASK_IDS.hanaRun,
        senderId: SCREENSHOT_USER_IDS.hana,
        text: row.text,
        createdAt,
      },
    });

    await prisma.taskBeat.create({
      data: {
        id: row.beatId,
        taskId: SCREENSHOT_TASK_IDS.hanaRun,
        type: "update",
        updateId: row.id,
        createdAt,
      },
    });
  }

  const latestUpdate = rows.at(-1);
  await prisma.task.update({
    where: { id: SCREENSHOT_TASK_IDS.hanaRun },
    data: {
      latestActivityAt: latestUpdate ? minutesAgo(latestUpdate.minutesAgo) : minutesAgo(70),
    },
  });
}

async function ensureFinalHanaCheers(viewerId: string) {
  await ensureCheer({
    id: "appstore-cheer-hana-post-you",
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    beatId: POST_BEAT_IDS.hanaRun,
    userId: viewerId,
    preset: CHEER_PRESETS.keepGoing,
    createdAt: minutesAgo(69),
  });
  await ensureCheer({
    id: "appstore-cheer-hana-update-1-adnan",
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    beatId: HANA_UPDATE_ROWS[0].beatId,
    userId: SCREENSHOT_USER_IDS.adnan,
    preset: CHEER_PRESETS.proudOfYou,
    createdAt: minutesAgo(170),
  });
  await ensureCheer({
    id: "appstore-cheer-hana-update-2-sara",
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    beatId: HANA_UPDATE_ROWS[1].beatId,
    userId: SCREENSHOT_USER_IDS.sara,
    preset: CHEER_PRESETS.youGotThis,
    createdAt: minutesAgo(110),
  });
  await ensureCheer({
    id: "appstore-cheer-hana-update-3-you",
    taskId: SCREENSHOT_TASK_IDS.hanaRun,
    beatId: HANA_UPDATE_ROWS[2].beatId,
    userId: viewerId,
    preset: CHEER_PRESETS.oneStep,
    createdAt: minutesAgo(50),
  });
}

async function main() {
  const viewer = await resolveViewer();

  if (stage === "initial") {
    await resetScreenshotRows(viewer.id);
  }

  await ensureScreenshotUsers(viewer.id);
  await ensureFollowGraph(viewer.id);
  await ensureBaseTasks(viewer);
  await ensureBaseSocialState(viewer.id);

  if (stage === "update1") {
    await ensureViewerCanCheerHana(viewer.id);
    await setHanaProgressUpdateCount(1);
  }

  if (stage === "final") {
    await ensureViewerCanCheerHana(viewer.id);
    await setHanaProgressUpdateCount(3);
    await ensureFinalHanaCheers(viewer.id);
  }

  const summary = await prisma.task.findMany({
    where: { id: { in: Object.values(SCREENSHOT_TASK_IDS) } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      name: true,
      feeling: true,
      pushCount: true,
      _count: { select: { progressUpdates: true, cheers: true } },
    },
  });

  console.log(
    JSON.stringify(
      {
        stage,
        viewer: {
          id: viewer.id,
          email: viewer.email,
          name: viewer.name,
        },
        tasks: summary,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
