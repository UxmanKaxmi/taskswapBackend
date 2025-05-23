import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";
import jwt from "jsonwebtoken";

const createTestUser = async (id: string, email: string) => {
  return prisma.user.create({
    data: {
      id,
      email,
      name: "Test User",
      photo: "https://example.com/avatar.png",
    },
  });
};

const getAuthHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
};

describe("Toggle Follow API", () => {
  const userAId = "user-a";
  const userBId = "user-b";

  beforeAll(async () => {
    await prisma.follow.deleteMany();
    await prisma.task.deleteMany();
    await prisma.reminderNote.deleteMany();
    await prisma.user.deleteMany();
    await createTestUser(userAId, "a@test.com");
    await createTestUser(userBId, "b@test.com");
  });

  it("follows another user when not already following", async () => {
    const res = await request(app)
      .get(`/users/toggleFollow/${userBId}`)
      .set(getAuthHeader(userAId));

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("followed");

    const follow = await prisma.follow.findFirst({
      where: { followerId: userAId, followingId: userBId },
    });
    expect(follow).not.toBeNull();
  });

  it("returns followers of a user", async () => {
    const res = await request(app)
      .get("/users/followers")
      .set(getAuthHeader(userBId));

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(userAId);
  });

  it("returns following list", async () => {
    const res = await request(app)
      .get("/users/following")
      .set(getAuthHeader(userAId));

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(userBId);
  });

  it("unfollows the user when already followed", async () => {
    const res = await request(app)
      .get(`/users/toggleFollow/${userBId}`)
      .set(getAuthHeader(userAId));

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("unfollowed");

    const follow = await prisma.follow.findFirst({
      where: { followerId: userAId, followingId: userBId },
    });
    expect(follow).toBeNull();
  });
});
