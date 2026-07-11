import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/index";
import { prisma } from "../src/db/client";

const getAuthHeader = (userId: string) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!);
  return { Authorization: `Bearer ${token}` };
};

const getHints = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstTimeHints: true },
  });
  return (user?.firstTimeHints ?? {}) as Record<
    string,
    { state: string; at: string; seeded?: boolean }
  >;
};

describe("First-time hints", () => {
  const ownerId = "hints-owner";
  const pusherId = "hints-pusher";
  const writerId = "hints-writer";
  let taskId: string;
  let beatId: string;

  beforeAll(async () => {
    await prisma.commentLike.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.cheer.deleteMany();
    await prisma.taskBeat.deleteMany();
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
          email: "hints-owner@test.com",
          name: "Hints Owner",
          photo: "https://example.com/owner.png",
        },
        {
          id: pusherId,
          email: "hints-pusher@test.com",
          name: "Hints Pusher",
          photo: "https://example.com/pusher.png",
        },
        {
          id: writerId,
          email: "hints-writer@test.com",
          name: "Hints Writer",
          photo: "https://example.com/writer.png",
        },
      ],
    });

    const task = await prisma.task.create({
      data: {
        text: "Run a 5k without stopping",
        type: "motivation",
        userId: ownerId,
      },
    });
    taskId = task.id;

    const beat = await prisma.taskBeat.create({
      data: { taskId, type: "post" },
    });
    beatId = beat.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /users/me/hints/:hintId", () => {
    it("rejects unauthenticated writes", async () => {
      const res = await request(app)
        .post("/users/me/hints/first_push_given")
        .send({ state: "dismissed" });

      expect(res.status).toBe(401);
    });

    it("returns 422 for an unknown hint id", async () => {
      const res = await request(app)
        .post("/users/me/hints/not_a_real_hint")
        .set(getAuthHeader(writerId))
        .send({ state: "dismissed" });

      expect(res.status).toBe(422);
    });

    it("returns 400 for an invalid state", async () => {
      const res = await request(app)
        .post("/users/me/hints/first_push_given")
        .set(getAuthHeader(writerId))
        .send({ state: "seen" });

      expect(res.status).toBe(400);
    });

    it("records a dismissal and is idempotent", async () => {
      const first = await request(app)
        .post("/users/me/hints/cheer_discovery")
        .set(getAuthHeader(writerId))
        .send({ state: "dismissed" });

      expect(first.status).toBe(200);
      expect(first.body.firstTimeHints.cheer_discovery.state).toBe("dismissed");
      const firstAt = first.body.firstTimeHints.cheer_discovery.at;

      const second = await request(app)
        .post("/users/me/hints/cheer_discovery")
        .set(getAuthHeader(writerId))
        .send({ state: "dismissed" });

      expect(second.status).toBe(200);
      expect(second.body.firstTimeHints.cheer_discovery.at).toBe(firstAt);
    });

    it("upgrades dismissed to completed but never the reverse", async () => {
      const completed = await request(app)
        .post("/users/me/hints/cheer_discovery")
        .set(getAuthHeader(writerId))
        .send({ state: "completed" });

      expect(completed.status).toBe(200);
      expect(completed.body.firstTimeHints.cheer_discovery.state).toBe(
        "completed"
      );

      const dismissedAgain = await request(app)
        .post("/users/me/hints/cheer_discovery")
        .set(getAuthHeader(writerId))
        .send({ state: "dismissed" });

      expect(dismissedAgain.status).toBe(200);
      expect(dismissedAgain.body.firstTimeHints.cheer_discovery.state).toBe(
        "completed"
      );

      const stored = await getHints(writerId);
      expect(stored.cheer_discovery.state).toBe("completed");
    });
  });

  describe("server-side completion backstops", () => {
    it("completes first_push_given on a push mutation", async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/push`)
        .set(getAuthHeader(pusherId))
        .send({});

      expect(res.status).toBeLessThan(300);

      const hints = await getHints(pusherId);
      expect(hints.first_push_given?.state).toBe("completed");
      expect(hints.first_push_given?.seeded).toBeUndefined();
    });

    it("completes cheer_discovery on a cheer mutation", async () => {
      const res = await request(app)
        .post(`/beats/${beatId}/cheer`)
        .set(getAuthHeader(pusherId))
        .send({ presetKey: "you_got_this" });

      expect(res.status).toBeLessThan(300);

      const hints = await getHints(pusherId);
      expect(hints.cheer_discovery?.state).toBe("completed");
    });

    it("completes first_goal_posted on task creation", async () => {
      const res = await request(app)
        .post("/tasks")
        .set(getAuthHeader(writerId))
        .send({
          text: "Write the first-time hints test",
          type: "motivation",
        });

      expect(res.status).toBeLessThan(300);

      const hints = await getHints(writerId);
      expect(hints.first_goal_posted?.state).toBe("completed");
    });

    it("completes first_response on a progress update mutation", async () => {
      const res = await request(app)
        .post(`/tasks/${taskId}/progress`)
        .set(getAuthHeader(ownerId))
        .send({ text: "Did my first training run today." });

      expect(res.status).toBeLessThan(300);

      const hints = await getHints(ownerId);
      expect(hints.first_response?.state).toBe("completed");
    });
  });

  describe("payload delivery", () => {
    it("includes firstTimeHints in GET /users/me", async () => {
      const res = await request(app)
        .get("/users/me")
        .set(getAuthHeader(pusherId));

      expect(res.status).toBe(200);
      expect(res.body.firstTimeHints).toBeDefined();
      expect(res.body.firstTimeHints.first_push_given?.state).toBe("completed");
    });
  });

  describe("global feature flags", () => {
    afterEach(() => {
      delete process.env.FLAG_FIRST_TIME_BEATS;
      delete process.env.FLAG_HINT_CHEER_DISCOVERY;
    });

    it("ships the master flag dark and per-hint flags on", async () => {
      const res = await request(app)
        .get("/features")
        .set(getAuthHeader(writerId));

      expect(res.status).toBe(200);
      expect(res.body.features.firstTimeBeats).toBe(false);
      expect(res.body.features.hintFirstGoalPosted).toBe(true);
      expect(res.body.features.hintFirstPushGiven).toBe(true);
      expect(res.body.features.hintCheerDiscovery).toBe(true);
      expect(res.body.features.hintFirstResponse).toBe(true);
      // The per-user goal-type prefs still ride along.
      expect(res.body.features.motivation).toBe(true);
    });

    it("honors env overrides without a deploy", async () => {
      process.env.FLAG_FIRST_TIME_BEATS = "true";
      process.env.FLAG_HINT_CHEER_DISCOVERY = "false";

      const res = await request(app)
        .get("/features")
        .set(getAuthHeader(writerId));

      expect(res.body.features.firstTimeBeats).toBe(true);
      expect(res.body.features.hintCheerDiscovery).toBe(false);
    });

    it("rejects PATCHes to global flags — they are not user preferences", async () => {
      const res = await request(app)
        .patch("/features")
        .set(getAuthHeader(writerId))
        .send({ features: { firstTimeBeats: true } });

      expect(res.status).toBe(400);
    });
  });
});
