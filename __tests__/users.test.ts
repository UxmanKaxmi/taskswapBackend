import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";
import jwt from "jsonwebtoken";

// ✅ Mock verifyGoogleToken to skip real token validation
jest.mock("../src/middleware/verifyGoogleToken", () => {
  return {
    verifyAuthProviderToken: (req: any, res: any, next: any) => {
      const auth = req.headers["authorization"];
      const testHeader = req.headers["x-test-auth"];

      if (!auth?.startsWith("Bearer") || testHeader !== "true") {
        return res.status(401).json({ error: "Missing or invalid token" });
      }

      if (req.body.provider === "apple") {
        const appleUserId =
          req.headers["x-test-apple-user-id"] || "test-apple-user-id";
        req.body.id = appleUserId;
        req.body.email = req.headers["x-test-email"];
        req.body.name = req.body.name || undefined;
        req.body.photo = "";
        req.body.provider = "apple";
        req.body.providerUserId = appleUserId;
        return next();
      }

      req.body.id = "test-user-id";
      req.body.email = "test@example.com";
      req.body.name = "Test User";
      req.body.photo = "https://example.com/photo.png";
      req.body.provider = "google";
      req.body.providerUserId = "test-user-id";
      return next();
    },
    verifyGoogleToken: (req: any, res: any, next: any) => {
      const auth = req.headers["authorization"];
      const testHeader = req.headers["x-test-auth"];

      if (auth?.startsWith("Bearer") && testHeader === "true") {
        // Inject mock user info
        req.body.id = "test-user-id";
        req.body.email = "test@example.com";
        req.body.name = "Test User";
        req.body.photo = "https://example.com/photo.png";
        req.body.provider = "google";
        req.body.providerUserId = "test-user-id";
        return next();
      }

      // Simulate missing/invalid token
      return res.status(401).json({ error: "Missing or invalid token" });
    },
  };
});

describe("User Routes", () => {
  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    photo: "https://example.com/photo.png",
    provider: "google",
  };
  const deleteUserId = "delete-me-user";
  const deleteOtherUserId = "delete-me-other-user";
  const linkedAppleUserId = "same-email-apple-user-id";

  const getAuthHeader = (userId: string) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
    return { Authorization: `Bearer ${token}` };
  };

  async function cleanupDeleteMeFixtures() {
    const ids = [deleteUserId, deleteOtherUserId];

    await prisma.notification.deleteMany({
      where: {
        OR: [{ userId: { in: ids } }, { senderId: { in: ids } }],
      },
    });
    await prisma.feedback.updateMany({
      where: { userId: { in: ids } },
      data: { userId: null },
    });
    await prisma.task.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await cleanupDeleteMeFixtures();
    await prisma.authAccount.deleteMany({
      where: {
        OR: [
          { userId: { in: [mockUser.id, "test-apple-user-id", linkedAppleUserId] } },
          { providerUserId: { in: ["test-apple-user-id", linkedAppleUserId] } },
        ],
      },
    });
    // First remove any tasks by this user to avoid FK violations
    await prisma.task.deleteMany({
      where: {
        userId: { in: [mockUser.id, "test-apple-user-id", linkedAppleUserId] },
      },
    });
    // Then remove the user
    await prisma.user.deleteMany({
      where: {
        id: { in: [mockUser.id, "test-apple-user-id", linkedAppleUserId] },
      },
    });
  });

  afterAll(async () => {
    await cleanupDeleteMeFixtures();
    await prisma.authAccount.deleteMany({
      where: {
        OR: [
          { userId: { in: [mockUser.id, "test-apple-user-id", linkedAppleUserId] } },
          { providerUserId: { in: ["test-apple-user-id", linkedAppleUserId] } },
        ],
      },
    });
    await prisma.task.deleteMany({
      where: {
        userId: { in: [mockUser.id, "test-apple-user-id", linkedAppleUserId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [mockUser.id, "test-apple-user-id", linkedAppleUserId] },
      },
    });
    await prisma.$disconnect();
  });

  it("should create or update a user", async () => {
    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer test-token")
      .set("x-test-auth", "true") // ✅ Trigger mock user injection
      .send(mockUser);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("id", mockUser.id);
    expect(res.body.user.email).toBe(mockUser.email);
    expect(res.body.user.provider).toBe("google");
    expect(res.body.user.providerUserId).toBe(mockUser.id);
    expect(res.body).toHaveProperty("token");
  });

  it("should link Apple login to an existing Google user with the same verified email", async () => {
    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer apple-test-token")
      .set("x-test-auth", "true")
      .set("x-test-email", mockUser.email)
      .set("x-test-apple-user-id", linkedAppleUserId)
      .send({
        id: "untrusted-client-id",
        email: "untrusted@example.com",
        name: "Apple Name",
        provider: "apple",
      });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(mockUser.id);
    expect(res.body.user.email).toBe(mockUser.email);

    await expect(
      prisma.authAccount.findMany({
        where: { userId: mockUser.id },
        select: { provider: true, providerUserId: true },
        orderBy: { provider: "asc" },
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        { provider: "apple", providerUserId: linkedAppleUserId },
        { provider: "google", providerUserId: mockUser.id },
      ])
    );
  });

  it("should create an Apple user from verified token claims", async () => {
    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer apple-test-token")
      .set("x-test-auth", "true")
      .set("x-test-email", "apple@example.com")
      .send({
        id: "untrusted-client-id",
        email: "untrusted@example.com",
        name: "Apple User",
        photo: "https://example.com/ignored.png",
        provider: "apple",
      });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("test-apple-user-id");
    expect(res.body.user.email).toBe("apple@example.com");
    expect(res.body.user.name).toBe("Apple User");
    expect(res.body.user.provider).toBe("apple");
    expect(res.body.user.providerUserId).toBe("test-apple-user-id");
    expect(res.body).toHaveProperty("token");
  });

  it("should preserve stored Apple name and email when later logins omit them", async () => {
    await prisma.user.upsert({
      where: { id: "test-apple-user-id" },
      update: {
        email: "stored-apple@example.com",
        name: "Stored Apple",
        provider: "apple",
        providerUserId: "test-apple-user-id",
      },
      create: {
        id: "test-apple-user-id",
        email: "stored-apple@example.com",
        name: "Stored Apple",
        provider: "apple",
        providerUserId: "test-apple-user-id",
      },
    });

    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer apple-test-token")
      .set("x-test-auth", "true")
      .send({
        provider: "apple",
        fcmToken: "latest-apple-fcm-token",
      });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("test-apple-user-id");
    expect(res.body.user.email).toBe("stored-apple@example.com");
    expect(res.body.user.name).toBe("Stored Apple");
    expect(res.body.user.fcmToken).toBe("latest-apple-fcm-token");
  });

  it("should fail without Authorization header", async () => {
    const res = await request(app)
      .post("/users") // no x-test-auth header
      .send(mockUser);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Missing or invalid token");
  });

  it("should return 401 for account deletion without app JWT", async () => {
    const res = await request(app).delete("/users/me");

    expect(res.status).toBe(401);
  });

  it("should delete the authenticated user's account and clean related data", async () => {
    await prisma.user.createMany({
      data: [
        {
          id: deleteUserId,
          email: "delete-me@test.com",
          name: "Delete Me",
          photo: "https://example.com/delete-me.png",
          fcmToken: "delete-me-fcm-token",
        },
        {
          id: deleteOtherUserId,
          email: "delete-me-other@test.com",
          name: "Other User",
          photo: "https://example.com/other.png",
          fcmToken: "other-fcm-token",
        },
      ],
    });

    const ownTask = await prisma.task.create({
      data: {
        text: `Owned task ${Date.now()}`,
        type: "motivation",
        userId: deleteUserId,
        avatar: "https://example.com/delete-me.png",
        name: "Delete Me",
        helpers: { connect: { id: deleteOtherUserId } },
      },
    });

    const otherTask = await prisma.task.create({
      data: {
        text: `Other task ${Date.now()}`,
        type: "motivation",
        userId: deleteOtherUserId,
        avatar: "https://example.com/other.png",
        name: "Other User",
        helpers: { connect: { id: deleteUserId } },
      },
    });

    const ownBeat = await prisma.taskBeat.create({
      data: { taskId: ownTask.id, type: "post" },
    });
    const otherBeat = await prisma.taskBeat.create({
      data: { taskId: otherTask.id, type: "post" },
    });
    const deletedUserComment = await prisma.comment.create({
      data: {
        text: "Delete my comment",
        taskId: otherTask.id,
        userId: deleteUserId,
      },
    });
    const otherUserComment = await prisma.comment.create({
      data: {
        text: "Comment on deleted user's task",
        taskId: ownTask.id,
        userId: deleteOtherUserId,
      },
    });
    const senderNotification = await prisma.notification.create({
      data: {
        userId: deleteOtherUserId,
        senderId: deleteUserId,
        type: "follow",
        message: "Delete Me followed you",
      },
    });
    const receivedReferral = await prisma.referral.create({
      data: {
        inviterId: deleteOtherUserId,
        inviteeId: deleteUserId,
        codeUsed: "OTHER-CODE",
        channel: "GENERIC",
      },
    });
    const feedback = await prisma.feedback.create({
      data: {
        userId: deleteUserId,
        category: "bug",
        message: "Delete feedback link",
        appVersion: "1.0.0",
        platform: "ios",
        timeSubmitted: new Date(),
      },
    });

    await Promise.all([
      prisma.follow.create({
        data: { followerId: deleteUserId, followingId: deleteOtherUserId },
      }),
      prisma.follow.create({
        data: { followerId: deleteOtherUserId, followingId: deleteUserId },
      }),
      prisma.notification.create({
        data: {
          userId: deleteUserId,
          senderId: deleteOtherUserId,
          type: "follow",
          message: "Other followed you",
        },
      }),
      prisma.referralCode.create({
        data: { userId: deleteUserId, code: "DELETE-ME-CODE" },
      }),
      prisma.referral.create({
        data: {
          inviterId: deleteUserId,
          inviteeId: deleteOtherUserId,
          codeUsed: "DELETE-ME-CODE",
          channel: "GENERIC",
        },
      }),
      prisma.referralLink.create({
        data: {
          userId: deleteUserId,
          channel: "GENERIC",
          token: "delete-me-token",
        },
      }),
      prisma.featureFlags.create({ data: { userId: deleteUserId } }),
      prisma.commentLike.create({
        data: { commentId: otherUserComment.id, userId: deleteUserId },
      }),
      prisma.commentLike.create({
        data: { commentId: deletedUserComment.id, userId: deleteOtherUserId },
      }),
      prisma.cheer.create({
        data: {
          taskId: otherTask.id,
          beatId: otherBeat.id,
          userId: deleteUserId,
          presetKey: "keep-going",
          presetTextSnapshot: "Keep going",
        },
      }),
      prisma.cheer.create({
        data: {
          taskId: ownTask.id,
          beatId: ownBeat.id,
          userId: deleteOtherUserId,
          presetKey: "keep-going",
          presetTextSnapshot: "Keep going",
        },
      }),
      prisma.push.create({
        data: { taskId: otherTask.id, userId: deleteUserId },
      }),
      prisma.push.create({
        data: { taskId: ownTask.id, userId: deleteOtherUserId },
      }),
      prisma.vote.create({
        data: { taskId: otherTask.id, userId: deleteUserId, option: "yes" },
      }),
      prisma.vote.create({
        data: { taskId: ownTask.id, userId: deleteOtherUserId, option: "yes" },
      }),
      prisma.reminderNote.create({
        data: {
          taskId: otherTask.id,
          senderId: deleteUserId,
          message: "Deleted user's reminder",
        },
      }),
      prisma.reminderNote.create({
        data: {
          taskId: ownTask.id,
          senderId: deleteOtherUserId,
          message: "Reminder on deleted user's task",
        },
      }),
      prisma.progressUpdate.create({
        data: {
          taskId: otherTask.id,
          senderId: deleteUserId,
          text: "Deleted user's progress",
        },
      }),
      prisma.progressUpdate.create({
        data: {
          taskId: ownTask.id,
          senderId: deleteOtherUserId,
          text: "Progress on deleted user's task",
        },
      }),
    ]);

    const res = await request(app)
      .delete("/users/me")
      .set(getAuthHeader(deleteUserId));

    expect(res.status).toBe(204);
    expect(res.text).toBe("");

    await expect(
      request(app).delete("/users/me").set(getAuthHeader(deleteUserId))
    ).resolves.toMatchObject({ status: 204 });

    await expect(
      prisma.user.findUnique({ where: { id: deleteUserId } })
    ).resolves.toBeNull();
    await expect(
      prisma.task.findUnique({ where: { id: ownTask.id } })
    ).resolves.toBeNull();
    await expect(
      prisma.task.findUnique({ where: { id: otherTask.id } })
    ).resolves.not.toBeNull();
    await expect(
      prisma.notification.findUnique({ where: { id: senderNotification.id } })
    ).resolves.toBeNull();
    await expect(
      prisma.referral.findUnique({ where: { id: receivedReferral.id } })
    ).resolves.toMatchObject({ inviteeId: null });
    await expect(
      prisma.feedback.findUnique({ where: { id: feedback.id } })
    ).resolves.toMatchObject({ userId: null });

    await expect(
      prisma.follow.count({
        where: {
          OR: [{ followerId: deleteUserId }, { followingId: deleteUserId }],
        },
      })
    ).resolves.toBe(0);
    await expect(
      prisma.notification.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.referralCode.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.referralLink.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.referral.count({ where: { inviterId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.featureFlags.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.comment.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.commentLike.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.cheer.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.push.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.vote.count({ where: { userId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.reminderNote.count({ where: { senderId: deleteUserId } })
    ).resolves.toBe(0);
    await expect(
      prisma.progressUpdate.count({ where: { senderId: deleteUserId } })
    ).resolves.toBe(0);
  });
});
