import { prisma } from "../src/db/client";
import { createSeededPushesForTask } from "../src/features/seededPush/seededPush.service";
import {
  SEEDED_USER_PROFILES,
  USER_ORIGIN,
  seedSeededUsers,
} from "../src/features/seededUser/seededUser.service";
import { createTask, getTaskById } from "../src/features/task/task.service";
import {
  getUserById,
  getUserProfileById,
  syncUserToDB,
  toggleFollowUser,
} from "../src/features/user/user.service";

const realOwnerId = "seeded-feature-real-owner";
const realViewerId = "seeded-feature-real-viewer";
const realFollowerId = "seeded-feature-real-follower";
const testUserIds = [realOwnerId, realViewerId, realFollowerId];

async function cleanupTestData() {
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { userId: { in: testUserIds } },
        { senderId: { in: testUserIds } },
        { userId: { in: SEEDED_USER_PROFILES.map((user) => user.id) } },
      ],
    },
  });
  await prisma.push.deleteMany({
    where: {
      OR: [
        { userId: { in: testUserIds } },
        { task: { userId: { in: testUserIds } } },
      ],
    },
  });
  await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: { in: testUserIds } },
        { followingId: { in: testUserIds } },
      ],
    },
  });
  await prisma.task.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
}

async function upsertRealUser(id: string, email: string, name: string) {
  return prisma.user.upsert({
    where: { id },
    update: {
      email,
      name,
      origin: USER_ORIGIN.REAL,
      fcmToken: null,
    },
    create: {
      id,
      email,
      name,
      origin: USER_ORIGIN.REAL,
      fcmToken: null,
    },
  });
}

describe("seeded users and seeded pushes", () => {
  beforeAll(async () => {
    await cleanupTestData();
    await seedSeededUsers();
    await Promise.all([
      upsertRealUser(realOwnerId, "seeded-owner@example.com", "Seeded Owner"),
      upsertRealUser(realViewerId, "seeded-viewer@example.com", "Seeded Viewer"),
      upsertRealUser(realFollowerId, "seeded-follower@example.com", "Seeded Follower"),
    ]);
  });

  beforeEach(async () => {
    process.env.SEEDED_PUSHES_ENABLED = "false";
    process.env.SEEDED_PUSH_MIN = "1";
    process.env.SEEDED_PUSH_MAX = "3";
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("creates seeded users idempotently", async () => {
    await seedSeededUsers();
    await seedSeededUsers();

    const count = await prisma.user.count({
      where: { origin: USER_ORIGIN.SEEDED },
    });

    expect(count).toBe(SEEDED_USER_PROFILES.length);
  });

  it("keeps public profiles free of email and origin", async () => {
    const profile = await getUserProfileById(SEEDED_USER_PROFILES[0].id, realViewerId);

    expect(profile).toHaveProperty("displayName");
    expect(profile).toHaveProperty("username");
    expect(profile).toHaveProperty("followersCount");
    expect(profile).toHaveProperty("publicStats");
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("origin");
  });

  it("allows own profile reads to expose account email", async () => {
    const profile = await getUserById(realOwnerId);

    expect(profile?.email).toBe("seeded-owner@example.com");
    expect(profile).not.toHaveProperty("origin");
  });

  it("prevents seeded users from authenticating", async () => {
    await expect(
      syncUserToDB({
        id: SEEDED_USER_PROFILES[0].id,
        email: SEEDED_USER_PROFILES[0].email,
        name: SEEDED_USER_PROFILES[0].name,
      })
    ).rejects.toThrow("Seeded users cannot authenticate");
  });

  it("creates seeded pushes for real-user motivation tasks when enabled", async () => {
    process.env.SEEDED_PUSHES_ENABLED = "true";
    process.env.SEEDED_PUSH_MIN = "2";
    process.env.SEEDED_PUSH_MAX = "2";

    const task = await createTask({
      text: `Seeded motivation ${Date.now()}`,
      type: "motivation",
      userId: realOwnerId,
    });

    const immediateResult = await createSeededPushesForTask(task.id);

    const pushes = await prisma.push.findMany({
      where: { taskId: task.id, source: "seeded" },
      select: { userId: true, source: true, message: true },
    });

    expect(immediateResult.created).toBe(2);
    expect(pushes).toHaveLength(2);
    expect(new Set(pushes.map((push) => push.userId)).size).toBe(2);
    expect(pushes.every((push) => push.source === "seeded")).toBe(true);
    expect(pushes.every((push) => typeof push.message === "string")).toBe(true);

    const notifications = await prisma.notification.count({
      where: {
        userId: realOwnerId,
        taskType: "motivation",
      },
    });

    expect(notifications).toBeGreaterThanOrEqual(2);
  });

  it("does not generate seeded pushes for non-motivation tasks", async () => {
    process.env.SEEDED_PUSHES_ENABLED = "true";

    const task = await createTask({
      text: `Seeded advice ${Date.now()}`,
      type: "advice",
      userId: realOwnerId,
    });

    await createSeededPushesForTask(task.id);

    const count = await prisma.push.count({
      where: { taskId: task.id, source: "seeded" },
    });

    expect(count).toBe(0);
  });

  it("does not generate seeded pushes for seeded-user-created tasks", async () => {
    process.env.SEEDED_PUSHES_ENABLED = "true";

    const task = await createTask({
      text: `Seeded owner motivation ${Date.now()}`,
      type: "motivation",
      userId: SEEDED_USER_PROFILES[1].id,
    });

    const count = await prisma.push.count({
      where: { taskId: task.id, source: "seeded" },
    });

    expect(count).toBe(0);
  });

  it("serializes push authors without email, origin, or source", async () => {
    process.env.SEEDED_PUSHES_ENABLED = "true";
    process.env.SEEDED_PUSH_MIN = "1";
    process.env.SEEDED_PUSH_MAX = "1";

    const task = await createTask({
      text: `Serialized seeded motivation ${Date.now()}`,
      type: "motivation",
      userId: realOwnerId,
    });

    await createSeededPushesForTask(task.id);

    const serialized = (await getTaskById(task.id, realViewerId)) as any;
    const push = serialized.pushHistory[0];

    expect(push.user).toHaveProperty("displayName");
    expect(push.user).toHaveProperty("username");
    expect(push.user).not.toHaveProperty("email");
    expect(push.user).not.toHaveProperty("origin");
    expect(push).not.toHaveProperty("source");
  });

  it("does not create notifications for seeded recipients", async () => {
    await toggleFollowUser(realFollowerId, SEEDED_USER_PROFILES[2].id);

    const notificationCount = await prisma.notification.count({
      where: { userId: SEEDED_USER_PROFILES[2].id },
    });

    expect(notificationCount).toBe(0);
  });
});
