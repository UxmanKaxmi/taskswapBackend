import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import { prisma } from "../src/db/client";

const getAuthHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
};

describe("Task progress updates", () => {
  const ownerId = "progress-owner";
  const helperId = "progress-helper";
  const pusherId = "progress-pusher";
  let taskId: string;

  beforeAll(async () => {
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.progressUpdate.deleteMany();
    await prisma.push.deleteMany();
    await prisma.reminderNote.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.referralLink.deleteMany();
    await prisma.referral.deleteMany();
    await prisma.referralCode.deleteMany();
    await prisma.featureFlags.deleteMany();
    await prisma.task.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: "progress-owner@test.com",
          name: "Progress Owner",
          photo: "https://example.com/owner.png",
        },
        {
          id: helperId,
          email: "progress-helper@test.com",
          name: "Progress Helper",
          photo: "https://example.com/helper.png",
        },
        {
          id: pusherId,
          email: "progress-pusher@test.com",
          name: "Progress Pusher",
          photo: "https://example.com/pusher.png",
        },
      ],
    });

    const task = await prisma.task.create({
      data: {
        text: "Ship the progress feature",
        type: "motivation",
        userId: ownerId,
        name: "Progress Owner",
        avatar: "https://example.com/owner.png",
        helpers: {
          connect: [{ id: helperId }],
        },
      },
    });

    taskId = task.id;

    await prisma.push.create({
      data: {
        userId: pusherId,
        taskId,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores progress updates, notifies pushers/helpers, and returns the full progress history on task detail", async () => {
    const progressTexts = [
      "First update: the backend route is live.",
      "Second update: notifications are wired.",
      "Third update: the mobile modal can now connect.",
    ];

    for (const text of progressTexts) {
      const shareRes = await request(app)
        .post(`/tasks/${taskId}/progress`)
        .set(getAuthHeader(ownerId))
        .send({ text });

      expect(shareRes.status).toBe(201);
      expect(Array.isArray(shareRes.body.progressUpdates)).toBe(true);
      expect(shareRes.body.progressUpdates).toHaveLength(1);
      expect(shareRes.body.progressUpdates[0]).toMatchObject({
        text,
      });
      expect(typeof shareRes.body.progressUpdates[0].createdAt).toBe("string");

      await prisma.progressUpdate.updateMany({
        where: {
          taskId,
          text,
        },
        data: {
          createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        },
      });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        type: "task-progress-update",
        userId: { in: [helperId, pusherId] },
      },
      orderBy: { createdAt: "asc" },
    });

    expect(notifications).toHaveLength(6);
    expect(notifications.map((notification) => notification.userId).sort()).toEqual([
      helperId,
      helperId,
      helperId,
      pusherId,
      pusherId,
      pusherId,
    ]);

    const detailRes = await request(app)
      .get(`/tasks/${taskId}`)
      .set(getAuthHeader(ownerId));

    expect(detailRes.status).toBe(200);
    expect(Array.isArray(detailRes.body.progressUpdates)).toBe(true);
    expect(detailRes.body.progressUpdates).toHaveLength(3);
    expect(detailRes.body.progressUpdates.map((item: { text: string }) => item.text)).toEqual([
      progressTexts[2],
      progressTexts[1],
      progressTexts[0],
    ]);
  });

  it("rejects a progress update sent within 6 hours", async () => {
    const cooldownTask = await prisma.task.create({
      data: {
        text: "Cooldown test task",
        type: "motivation",
        userId: ownerId,
        name: "Progress Owner",
        avatar: "https://example.com/owner.png",
      },
    });

    const firstRes = await request(app)
      .post(`/tasks/${cooldownTask.id}/progress`)
      .set(getAuthHeader(ownerId))
      .send({ text: "First cooldown update" });

    expect(firstRes.status).toBe(201);

    const secondRes = await request(app)
      .post(`/tasks/${cooldownTask.id}/progress`)
      .set(getAuthHeader(ownerId))
      .send({ text: "Second cooldown update" });

    expect(secondRes.status).toBe(429);
    expect(secondRes.body.error).toMatch(/every 6 hours/i);
  });
});
