import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import { prisma } from "../src/db/client";

const getAuthHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
};

describe("Home Summary API", () => {
  const viewerId = "home-viewer";
  const ownerAId = "home-owner-a";
  const ownerBId = "home-owner-b";
  const ownerCId = "home-owner-c";

  beforeAll(async () => {
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
        {
          id: viewerId,
          email: "viewer@test.com",
          name: "Uxman Khan",
          photo: "https://example.com/viewer.png",
        },
        {
          id: ownerAId,
          email: "owner-a@test.com",
          name: "Usman",
          photo: "https://example.com/a.png",
        },
        {
          id: ownerBId,
          email: "owner-b@test.com",
          name: "Tariq",
          photo: "https://example.com/b.png",
        },
        {
          id: ownerCId,
          email: "owner-c@test.com",
          name: "Ahmed",
          photo: "https://example.com/c.png",
        },
      ],
    });

    await prisma.follow.createMany({
      data: [
        { followerId: viewerId, followingId: ownerAId },
        { followerId: viewerId, followingId: ownerBId },
      ],
    });

    const successStoryTask = await prisma.task.create({
      data: {
        text: "go to the gym",
        type: "motivation",
        userId: ownerAId,
        name: "Usman",
        avatar: "https://example.com/a.png",
      },
    });

    await prisma.push.create({
      data: {
        userId: viewerId,
        taskId: successStoryTask.id,
      },
    });

    await prisma.task.update({
      where: { id: successStoryTask.id },
      data: {
        completed: true,
        completedAt: new Date(),
      },
    });

    await prisma.task.create({
      data: {
        text: "study tonight",
        type: "motivation",
        userId: ownerBId,
        name: "Tariq",
        avatar: "https://example.com/b.png",
      },
    });

    const updateProgressTask = await prisma.task.create({
      data: {
        text: "finish the side project",
        type: "motivation",
        userId: viewerId,
        name: "Uxman Khan",
        avatar: "https://example.com/viewer.png",
      },
    });

    await prisma.push.create({
      data: {
        userId: ownerAId,
        taskId: updateProgressTask.id,
      },
    });

    await prisma.task.create({
      data: {
        text: "How do I stop losing motivation after one week?",
        type: "advice",
        userId: ownerCId,
        name: "Ahmed",
        avatar: "https://example.com/c.png",
        helpers: {
          connect: [{ id: viewerId }],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns all home modules for the mobile app", async () => {
    const res = await request(app)
      .get("/users/me/home-summary")
      .set(getAuthHeader(viewerId));

    expect(res.status).toBe(200);
    expect(res.body.modules.successStory).toMatchObject({
      type: "success_story",
      ctaLabel: "View update",
      entity: {
        ownerId: ownerAId,
        ownerName: "Usman",
        taskText: "go to the gym",
      },
    });
    expect(res.body.modules.needsYourPush).toMatchObject({
      type: "needs_your_push",
      ctaLabel: "Send push",
      entity: {
        ownerId: ownerBId,
        ownerName: "Tariq",
        taskText: "study tonight",
      },
    });
    expect(res.body.modules.updateProgress).toMatchObject({
      type: "update_progress",
      ctaLabel: "Update progress",
      entity: {
        ownerId: viewerId,
        ownerName: "Uxman Khan",
        taskText: "finish the side project",
      },
      stats: {
        pushCount: 1,
      },
    });
    expect(res.body.modules.adviceRequestWaitingOnYou).toMatchObject({
      type: "advice_request_waiting_on_you",
      ctaLabel: "Give advice",
      entity: {
        ownerId: ownerCId,
        ownerName: "Ahmed",
      },
      question: "How do I stop losing motivation after one week?",
    });
  });

  it("returns empty modules for guest access", async () => {
    const res = await request(app).get("/users/me/home-summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      modules: {
        successStory: null,
        needsYourPush: null,
        updateProgress: null,
        adviceRequestWaitingOnYou: null,
      },
    });
  });
});
