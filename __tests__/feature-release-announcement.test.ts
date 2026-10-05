import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import { prisma } from "../src/db/client";
import { sendPushNotification } from "../src/utils/sendPushNotification";

jest.mock("../src/utils/sendPushNotification", () => ({
  sendPushNotification: jest.fn().mockResolvedValue(true),
  sendSilentPushNotification: jest.fn().mockResolvedValue(true),
}));

const ADMIN_ID = "feature-release-admin";
const REAL_WITH_TOKEN_ID = "feature-release-real-token";
const REAL_WITHOUT_TOKEN_ID = "feature-release-real-no-token";
const SEEDED_ID = "feature-release-seeded";

const tokenFor = (userId: string) =>
  jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });

async function createAnnouncementUsers() {
  await prisma.user.createMany({
    data: [
      {
        id: ADMIN_ID,
        email: `${ADMIN_ID}@test.com`,
        name: "Admin",
        origin: "real",
      },
      {
        id: REAL_WITH_TOKEN_ID,
        email: `${REAL_WITH_TOKEN_ID}@test.com`,
        name: "Real With Token",
        origin: "real",
        fcmToken: "feature-release-token",
      },
      {
        id: REAL_WITHOUT_TOKEN_ID,
        email: `${REAL_WITHOUT_TOKEN_ID}@test.com`,
        name: "Real Without Token",
        origin: "real",
      },
      {
        id: SEEDED_ID,
        email: `${SEEDED_ID}@test.com`,
        name: "Seeded",
        origin: "seeded",
        fcmToken: "seeded-token",
      },
    ],
  });
}

describe("feature release announcements", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET ||= "test-secret";
    process.env.ADMIN_USER_IDS = ADMIN_ID;
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [ADMIN_ID, REAL_WITH_TOKEN_ID, REAL_WITHOUT_TOKEN_ID, SEEDED_ID],
        },
      },
    });
    await createAnnouncementUsers();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    delete process.env.ADMIN_USER_IDS;
    await prisma.$disconnect();
  });

  it("previews real users and push recipients without sending", async () => {
    const res = await request(app)
      .post("/notification/feature-release")
      .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`)
      .send({
        featureKey: "circle",
        featureName: "Circles",
        dryRun: true,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dryRun: true,
      targetUserCount: 3,
      pushRecipientCount: 1,
      skippedAlreadyAnnounced: 0,
      createdNotificationCount: 0,
      pushSentCount: 0,
      pushFailedCount: 0,
    });
    expect(await prisma.notification.count()).toBe(0);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("announces once per feature key to real users only", async () => {
    const body = {
      featureKey: "circle",
      featureName: "Circles",
      title: "Circles are here",
      body: "Start a shared goal with your people.",
      deeplinkPath: "/circles",
      screen: "Circles",
    };

    const first = await request(app)
      .post("/notification/feature-release")
      .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`)
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      dryRun: false,
      targetUserCount: 3,
      pushRecipientCount: 1,
      skippedAlreadyAnnounced: 0,
      createdNotificationCount: 3,
      pushSentCount: 1,
      pushFailedCount: 0,
    });

    expect(await prisma.notification.count({ where: { type: "feature-release" } })).toBe(3);
    expect(
      await prisma.notification.count({
        where: { userId: SEEDED_ID, type: "feature-release" },
      })
    ).toBe(0);
    expect(sendPushNotification).toHaveBeenCalledWith(
      "feature-release-token",
      "Circles are here",
      "Start a shared goal with your people.",
      {
        notificationType: "feature-release",
        featureKey: "circle",
        featureName: "Circles",
        deeplinkPath: "/circles",
        screen: "Circles",
      }
    );

    jest.clearAllMocks();

    const second = await request(app)
      .post("/notification/feature-release")
      .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      targetUserCount: 0,
      pushRecipientCount: 0,
      skippedAlreadyAnnounced: 3,
      createdNotificationCount: 0,
      pushSentCount: 0,
      pushFailedCount: 0,
    });
    expect(sendPushNotification).not.toHaveBeenCalled();
  });
});
