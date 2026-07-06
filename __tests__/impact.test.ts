import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import { prisma } from "../src/db/client";

const getAuthHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
};

const DAY = 86_400_000;

describe("Impact API", () => {
  const meId = "impact-me";
  const mayaId = "impact-maya";
  const bilalId = "impact-bilal";
  const saraId = "impact-sara";

  beforeAll(async () => {
    await prisma.cheer.deleteMany();
    await prisma.taskBeat.deleteMany();
    await prisma.progressUpdate.deleteMany();
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.notification.deleteMany();
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
        { id: meId, email: "me@test.com", name: "Usman Kazmi" },
        {
          id: mayaId,
          email: "maya@test.com",
          name: "Maya K.",
          photo: "https://example.com/maya.png",
        },
        { id: bilalId, email: "bilal@test.com", name: "Bilal" },
        { id: saraId, email: "sara@test.com", name: "Sara" },
      ],
    });

    const now = Date.now();

    // Maya's task: I pushed it AND cheered it, she finished 2 days after the cheer.
    const mayaTask = await prisma.task.create({
      data: {
        text: "Send the email she was avoiding",
        type: "motivation",
        userId: mayaId,
        name: "Maya K.",
        completed: true,
        completedAt: new Date(now),
      },
    });
    await prisma.push.create({
      data: { userId: meId, taskId: mayaTask.id, createdAt: new Date(now - 3 * DAY) },
    });
    const mayaBeat = await prisma.taskBeat.create({
      data: { taskId: mayaTask.id, type: "post" },
    });
    await prisma.cheer.create({
      data: {
        taskId: mayaTask.id,
        beatId: mayaBeat.id,
        userId: meId,
        presetKey: "you_got_this",
        presetTextSnapshot: "You got this.",
        createdAt: new Date(now - 2 * DAY),
      },
    });

    // Bilal's task: pushed but still in progress.
    const bilalTask = await prisma.task.create({
      data: { text: "Run 5k", type: "motivation", userId: bilalId, name: "Bilal" },
    });
    await prisma.push.create({ data: { userId: meId, taskId: bilalTask.id } });

    // Sara's task: pushed and completed (no cheer).
    const saraTask = await prisma.task.create({
      data: {
        text: "Apply for the course",
        type: "motivation",
        userId: saraId,
        name: "Sara",
        completed: true,
        completedAt: new Date(now - DAY),
      },
    });
    await prisma.push.create({ data: { userId: meId, taskId: saraTask.id } });

    // My own task: finished, pushed and cheered by Bilal.
    const myTask = await prisma.task.create({
      data: {
        text: "Ship the impact screen",
        type: "motivation",
        userId: meId,
        name: "Usman Kazmi",
        completed: true,
        completedAt: new Date(now),
      },
    });
    await prisma.push.create({ data: { userId: bilalId, taskId: myTask.id } });
    const myBeat = await prisma.taskBeat.create({
      data: { taskId: myTask.id, type: "post" },
    });
    await prisma.cheer.create({
      data: {
        taskId: myTask.id,
        beatId: myBeat.id,
        userId: bilalId,
        presetKey: "keep_going",
        presetTextSnapshot: "Keep going.",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns giving-first impact stats for the logged-in user", async () => {
    const res = await request(app)
      .get("/users/me/impact")
      .set(getAuthHeader(meId));

    expect(res.status).toBe(200);

    expect(res.body.peopleHelped.count).toBe(2);
    expect(res.body.peopleHelped.preview.map((u: { id: string }) => u.id).sort()).toEqual(
      [mayaId, saraId].sort()
    );

    expect(res.body.giving).toEqual({
      peoplePushed: 3,
      cheersSent: 1,
      tasksBacked: 3,
    });

    expect(res.body.topCheer).toMatchObject({
      recipient: { id: mayaId, name: "Maya K." },
      taskText: "Send the email she was avoiding",
      cheerText: "You got this.",
      daysToFinish: 2,
    });

    expect(res.body.journey).toEqual({
      tasksFinished: 1,
      cheersReceived: 1,
      pushesReceived: 1,
    });
  });

  it("returns empty impact for a user who has not backed anyone", async () => {
    const res = await request(app)
      .get("/users/me/impact")
      .set(getAuthHeader(saraId));

    expect(res.status).toBe(200);
    expect(res.body.peopleHelped).toEqual({ count: 0, preview: [] });
    expect(res.body.giving).toEqual({
      peoplePushed: 0,
      cheersSent: 0,
      tasksBacked: 0,
    });
    expect(res.body.topCheer).toBeNull();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/users/me/impact");

    expect(res.status).toBe(401);
  });
});
