import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import { prisma } from "../src/db/client";

const getAuthHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
};

describe("Profile stats (GET /users/me and /users/:id/profile)", () => {
  const meId = "me-profile-user";
  const friendId = "me-profile-friend";
  const thirdId = "me-profile-third";
  const fixtureIds = [meId, friendId, thirdId];

  async function cleanupFixtures() {
    await prisma.push.deleteMany({ where: { userId: { in: fixtureIds } } });
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: { in: fixtureIds } },
          { followingId: { in: fixtureIds } },
        ],
      },
    });
    await prisma.task.deleteMany({ where: { userId: { in: fixtureIds } } });
    await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
  }

  beforeAll(async () => {
    await cleanupFixtures();

    await prisma.user.createMany({
      data: [
        {
          id: meId,
          email: "me-profile@test.com",
          name: "Me Profile",
          photo: "https://example.com/me.png",
        },
        {
          id: friendId,
          email: "me-profile-friend@test.com",
          name: "Friend Profile",
          photo: "https://example.com/friend.png",
        },
        {
          id: thirdId,
          email: "me-profile-third@test.com",
          name: "Third Profile",
          photo: "https://example.com/third.png",
        },
      ],
    });

    const myTask = await prisma.task.create({
      data: {
        text: "my completed task",
        type: "motivation",
        userId: meId,
        name: "Me Profile",
        avatar: "https://example.com/me.png",
        completed: true,
        completedAt: new Date(),
      },
    });
    const friendTask = await prisma.task.create({
      data: {
        text: "friend task",
        type: "motivation",
        userId: friendId,
        name: "Friend Profile",
        avatar: "https://example.com/friend.png",
      },
    });
    const thirdTask = await prisma.task.create({
      data: {
        text: "third task",
        type: "motivation",
        userId: thirdId,
        name: "Third Profile",
        avatar: "https://example.com/third.png",
      },
    });

    await prisma.push.createMany({
      data: [
        // Two pushes given by me
        { userId: meId, taskId: friendTask.id },
        { userId: meId, taskId: thirdTask.id },
        // A push received on my task — must not count as given by me
        { userId: friendId, taskId: myTask.id },
      ],
    });

    await prisma.follow.createMany({
      data: [
        { followerId: friendId, followingId: meId },
        { followerId: meId, followingId: friendId },
      ],
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/users/me");

    expect(res.status).toBe(401);
  });

  it("returns profile stats including pushesGiven and dayStreak", async () => {
    const res = await request(app).get("/users/me").set(getAuthHeader(meId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: meId,
      email: "me-profile@test.com",
      name: "Me Profile",
      followersCount: 1,
      followingCount: 1,
      pushesGiven: 2,
      taskSuccessRate: 100,
      tasksDone: 1,
      dayStreak: 1,
    });
  });

  it("returns pushesGiven on the public profile view", async () => {
    const res = await request(app)
      .get(`/users/${friendId}/profile`)
      .set(getAuthHeader(meId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: friendId,
      pushesGiven: 1,
      isFollowing: true,
      isFollowedBy: true,
    });
  });
});
