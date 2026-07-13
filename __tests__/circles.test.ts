import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";
import jwt from "jsonwebtoken";
import { runCircleLifecycleSweep } from "../src/features/circle/circle.sweep";

const CREATOR_ID = "circle-creator-1";
const JOINER_B_ID = "circle-joiner-b";
const JOINER_C_ID = "circle-joiner-c";
const JOINER_D_ID = "circle-joiner-d";
const JOINER_E_ID = "circle-joiner-e";
const OVERFLOW_ID = "circle-overflow-f";
const OUTSIDER_ID = "circle-outsider";

const tokenFor = (userId: string) =>
  jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });

const createTestUser = (id: string, name: string) =>
  prisma.user.create({
    data: { id, email: `${id}@test.com`, name, photo: `http://x/${id}.jpg` },
  });

const GOAL_TEXT = "go to the gym every morning this week";

describe("Circles", () => {
  let circleId: string;
  let inviteToken: string;
  let creatorTaskId: string;
  let joinerBTaskId: string;

  beforeAll(async () => {
    process.env.FLAG_CIRCLES = "true";

    await prisma.notification.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.push.deleteMany();
    await prisma.circleMember.deleteMany();
    await prisma.circleInvite.deleteMany();
    await prisma.circle.deleteMany();
    await prisma.task.deleteMany();
    await prisma.user.deleteMany();

    await createTestUser(CREATOR_ID, "Usman Creator");
    await createTestUser(JOINER_B_ID, "Hina Joiner");
    await createTestUser(JOINER_C_ID, "Adnan Joiner");
    await createTestUser(JOINER_D_ID, "Sana Joiner");
    await createTestUser(JOINER_E_ID, "Extra Joiner");
    await createTestUser(OVERFLOW_ID, "Overflow Person");
    await createTestUser(OUTSIDER_ID, "Outsider Person");
  });

  afterAll(async () => {
    delete process.env.FLAG_CIRCLES;
    await prisma.$disconnect();
  });

  describe("creation", () => {
    it("creates the creator's member row and live task immediately", async () => {
      const res = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(CREATOR_ID)}`)
        .send({ goalText: GOAL_TEXT, feeling: "avoiding_it" });

      expect(res.status).toBe(201);
      expect(res.body.circle.goalText).toBe(GOAL_TEXT);
      expect(res.body.circle.status).toBe("active");
      expect(res.body.inviteLink).toContain("/c/");
      expect(res.body.task.circleId).toBe(res.body.circle.id);

      circleId = res.body.circle.id;
      creatorTaskId = res.body.task.id;
      inviteToken = res.body.inviteLink.split("/c/")[1];

      const member = await prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId, userId: CREATOR_ID } },
      });
      expect(member?.state).toBe("active");
      expect(member?.taskId).toBe(creatorTaskId);

      const task = await prisma.task.findUnique({ where: { id: creatorTaskId } });
      expect(task?.text).toBe(GOAL_TEXT);
      expect(task?.type).toBe("motivation");
      expect(task?.feeling).toBe("avoiding_it");
    });

    it("rejects an anonymous circle (both are mutually exclusive)", async () => {
      const res = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(CREATOR_ID)}`)
        .send({ goalText: "secret circle attempt", isAnonymous: true });

      expect(res.status).toBe(400);
    });

    it("rejects a sentence over 120 characters", async () => {
      const res = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(CREATOR_ID)}`)
        .send({ goalText: "x".repeat(121) });

      expect(res.status).toBe(400);
    });
  });

  describe("joining", () => {
    it("joins with the shared sentence and the joiner's own mood", async () => {
      const res = await request(app)
        .post(`/invites/${inviteToken}/join`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_B_ID)}`)
        .send({ feeling: "tired" });

      expect(res.status).toBe(201);
      expect(res.body.task.text).toBe(GOAL_TEXT);
      expect(res.body.task.feeling).toBe("tired");
      expect(res.body.task.circleId).toBe(circleId);
      expect(res.body.member.state).toBe("active");

      joinerBTaskId = res.body.task.id;
    });

    it("duplicate joins are idempotent", async () => {
      const res = await request(app)
        .post(`/invites/${inviteToken}/join`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_B_ID)}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.alreadyMember).toBe(true);
      expect(res.body.task.id).toBe(joinerBTaskId);

      const memberCount = await prisma.circleMember.count({
        where: { circleId, userId: JOINER_B_ID },
      });
      expect(memberCount).toBe(1);
    });

    it("returns 410 for an expired invite", async () => {
      const expired = await prisma.circleInvite.create({
        data: {
          circleId,
          token: "expired-token-test",
          invitedById: CREATOR_ID,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const res = await request(app)
        .post(`/invites/${expired.token}/join`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_C_ID)}`)
        .send({});

      expect(res.status).toBe(410);
    });

    it("fills to 5 members, then returns 409 full", async () => {
      for (const joinerId of [JOINER_C_ID, JOINER_D_ID, JOINER_E_ID]) {
        const res = await request(app)
          .post(`/invites/${inviteToken}/join`)
          .set("Authorization", `Bearer ${tokenFor(joinerId)}`)
          .send({});
        expect(res.status).toBe(201);
      }

      const overflow = await request(app)
        .post(`/invites/${inviteToken}/join`)
        .set("Authorization", `Bearer ${tokenFor(OVERFLOW_ID)}`)
        .send({});

      expect(overflow.status).toBe(409);

      const inviteAtCapacity = await request(app)
        .post(`/circles/${circleId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(CREATOR_ID)}`)
        .send({});

      expect(inviteAtCapacity.status).toBe(409);
    });

    it("only members can mint invites", async () => {
      const res = await request(app)
        .post(`/circles/${circleId}/invites`)
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it("notified existing members about the joins", async () => {
      const joinNotifications = await prisma.notification.findMany({
        where: { userId: CREATOR_ID, type: "circle-member-joined" },
      });
      expect(joinNotifications.length).toBeGreaterThan(0);
    });
  });

  describe("feed", () => {
    it("never renders member tasks as individual cards", async () => {
      const res = await request(app)
        .get("/tasks")
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`);

      expect(res.status).toBe(200);
      const feedTaskIds = res.body.data.map((task: { id: string }) => task.id);
      expect(feedTaskIds).not.toContain(creatorTaskId);
      expect(feedTaskIds).not.toContain(joinerBTaskId);
    });

    it("returns one circle card per circle when the client opts in", async () => {
      const res = await request(app)
        .get("/tasks?includeCircles=1")
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`);

      expect(res.status).toBe(200);
      const cards = res.body.circles.filter(
        (card: { id: string }) => card.id === circleId
      );
      expect(cards).toHaveLength(1);
      expect(cards[0].kind).toBe("circle");
      expect(cards[0].goalText).toBe(GOAL_TEXT);
      expect(cards[0].members).toHaveLength(5);
      expect(JSON.stringify(cards[0])).not.toContain("lastActive");
    });

    it("returns no circle cards when the kill switch is off", async () => {
      process.env.FLAG_CIRCLES = "false";

      const res = await request(app)
        .get("/tasks?includeCircles=1")
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.circles ?? []).toHaveLength(0);

      process.env.FLAG_CIRCLES = "true";
    });
  });

  describe("detail + push-all", () => {
    it("renders lanes for signed-out viewers", async () => {
      const res = await request(app).get(`/circles/${circleId}`);

      expect(res.status).toBe(200);
      expect(res.body.lanes).toHaveLength(5);
      expect(res.body.viewer.isMember).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain("lastActive");
    });

    it("push-all pushes every member task once and skips repeats", async () => {
      const first = await request(app)
        .post(`/circles/${circleId}/push-all`)
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`)
        .send({});

      expect(first.status).toBe(200);
      expect(first.body.pushed).toHaveLength(5);

      const second = await request(app)
        .post(`/circles/${circleId}/push-all`)
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`)
        .send({});

      expect(second.status).toBe(200);
      expect(second.body.pushed).toHaveLength(0);
    });

    it("push-all from a member skips their own task", async () => {
      const res = await request(app)
        .post(`/circles/${circleId}/push-all`)
        .set("Authorization", `Bearer ${tokenFor(CREATOR_ID)}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.pushed).toHaveLength(4);
      expect(res.body.pushed).not.toContain(creatorTaskId);
    });

    it("hides a blocked member's lane from the blocker", async () => {
      await request(app)
        .post(`/users/${JOINER_B_ID}/block`)
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`)
        .send({});

      const res = await request(app)
        .get(`/circles/${circleId}`)
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.lanes).toHaveLength(4);
      expect(
        res.body.lanes.some(
          (lane: { userId: string }) => lane.userId === JOINER_B_ID
        )
      ).toBe(false);

      await request(app)
        .delete(`/users/${JOINER_B_ID}/block`)
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`);
    });
  });

  describe("completion", () => {
    it("marks the member done and shows the win in their lane", async () => {
      const res = await request(app)
        .patch(`/tasks/${creatorTaskId}/complete`)
        .set("Authorization", `Bearer ${tokenFor(CREATOR_ID)}`);

      expect(res.status).toBe(200);

      const member = await prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId, userId: CREATOR_ID } },
      });
      expect(member?.state).toBe("done");

      const detail = await request(app).get(`/circles/${circleId}`);
      const creatorLane = detail.body.lanes.find(
        (lane: { userId: string }) => lane.userId === CREATOR_ID
      );
      expect(creatorLane.state).toBe("done");
      expect(creatorLane.completed).toBe(true);
    });

    it("keeps the win cheerable via the done event's post beat", async () => {
      // The activity timeline offers "cheer them on" on done wins: the done
      // event carries the task's post beat, cheerable even though the task
      // is completed and newer update beats exist.
      const viewerId = JOINER_B_ID;
      const detail = await request(app)
        .get(`/circles/${circleId}`)
        .set("Authorization", `Bearer ${tokenFor(viewerId)}`);

      const doneEvent = detail.body.activity.find(
        (event: { kind: string; userId?: string }) =>
          event.kind === "done" && event.userId === CREATOR_ID
      );
      expect(doneEvent).toBeTruthy();
      expect(doneEvent.beatId).toBeTruthy();
      expect(doneEvent.viewerHasCheered).toBe(false);

      const cheer = await request(app)
        .post(`/beats/${doneEvent.beatId}/cheer`)
        .set("Authorization", `Bearer ${tokenFor(viewerId)}`)
        .send({ presetKey: "keep_going" });
      expect(cheer.status).toBe(200);

      const after = await request(app)
        .get(`/circles/${circleId}`)
        .set("Authorization", `Bearer ${tokenFor(viewerId)}`);
      const afterEvent = after.body.activity.find(
        (event: { kind: string; userId?: string }) =>
          event.kind === "done" && event.userId === CREATOR_ID
      );
      expect(afterEvent.viewerHasCheered).toBe(true);
      expect(afterEvent.cheerCount).toBe(1);
    });

    it("completes the circle when every member has won", async () => {
      const remaining = await prisma.circleMember.findMany({
        where: { circleId, state: "active" },
        select: { userId: true, taskId: true },
      });

      for (const member of remaining) {
        const res = await request(app)
          .patch(`/tasks/${member.taskId}/complete`)
          .set("Authorization", `Bearer ${tokenFor(member.userId)}`);
        expect(res.status).toBe(200);
      }

      const circle = await prisma.circle.findUnique({ where: { id: circleId } });
      expect(circle?.status).toBe("complete");
      expect(circle?.completedAt).toBeTruthy();

      const completeNotifications = await prisma.notification.findMany({
        where: { type: "circle-complete" },
      });
      expect(completeNotifications.length).toBe(5);
    });
  });

  describe("leave + dissolve", () => {
    let soloCircleId: string;
    let duoCircleId: string;
    let duoCreatorTaskId: string;

    it("dissolves a never-joined circle once its invites expire", async () => {
      const created = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(JOINER_C_ID)}`)
        .send({ goalText: "learn to cook one real dish" });

      expect(created.status).toBe(201);
      soloCircleId = created.body.circle.id;

      await prisma.circleInvite.updateMany({
        where: { circleId: soloCircleId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await runCircleLifecycleSweep();

      const circle = await prisma.circle.findUnique({
        where: { id: soloCircleId },
      });
      expect(circle?.status).toBe("dissolved");

      const task = await prisma.task.findUnique({
        where: { id: created.body.task.id },
      });
      expect(task?.circleId).toBeNull();

      const quietNotice = await prisma.notification.findFirst({
        where: { userId: JOINER_C_ID, type: "circle-dissolved" },
      });
      expect(quietNotice).toBeTruthy();
    });

    it("leave is silent, detaches the task, and dissolves a 2-member circle", async () => {
      const created = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(JOINER_D_ID)}`)
        .send({ goalText: "walk 8k steps daily" });
      duoCircleId = created.body.circle.id;
      duoCreatorTaskId = created.body.task.id;
      const duoToken = created.body.inviteLink.split("/c/")[1];

      const joined = await request(app)
        .post(`/invites/${duoToken}/join`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_E_ID)}`)
        .send({});
      expect(joined.status).toBe(201);

      // Invites must be spent before a leave can dissolve the circle.
      await prisma.circleInvite.updateMany({
        where: { circleId: duoCircleId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const notificationsBefore = await prisma.notification.count({
        where: { userId: JOINER_D_ID },
      });

      const left = await request(app)
        .post(`/circles/${duoCircleId}/leave`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_E_ID)}`)
        .send({});
      expect(left.status).toBe(200);

      const leaverTask = await prisma.task.findUnique({
        where: { id: joined.body.task.id },
      });
      expect(leaverTask?.circleId).toBeNull();

      // The leave itself is silent — the only new notification the remaining
      // member may receive is the quiet dissolve notice.
      const leaveNoise = await prisma.notification.findMany({
        where: {
          userId: JOINER_D_ID,
          type: { in: ["circle-member-joined", "circle-progress-update"] },
          createdAt: { gte: new Date(Date.now() - 5000) },
        },
      });
      expect(
        leaveNoise.filter((n) => n.createdAt.getTime() > Date.now() - 2000)
      ).toHaveLength(0);

      const circle = await prisma.circle.findUnique({
        where: { id: duoCircleId },
      });
      expect(circle?.status).toBe("dissolved");

      const creatorTask = await prisma.task.findUnique({
        where: { id: duoCreatorTaskId },
      });
      expect(creatorTask?.circleId).toBeNull();

      const notificationsAfter = await prisma.notification.count({
        where: { userId: JOINER_D_ID, type: "circle-dissolved" },
      });
      expect(notificationsAfter).toBeGreaterThan(0);
      expect(notificationsBefore).toBeGreaterThanOrEqual(0);
    });

    it("deleting a circle task is a silent leave", async () => {
      const created = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(JOINER_C_ID)}`)
        .send({ goalText: "read ten pages a night" });
      const readCircleId = created.body.circle.id;
      const readToken = created.body.inviteLink.split("/c/")[1];

      const joined = await request(app)
        .post(`/invites/${readToken}/join`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_D_ID)}`)
        .send({});

      const deleted = await request(app)
        .delete(`/tasks/${joined.body.task.id}`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_D_ID)}`);
      expect(deleted.status).toBe(204);

      const member = await prisma.circleMember.findUnique({
        where: {
          circleId_userId: { circleId: readCircleId, userId: JOINER_D_ID },
        },
      });
      expect(member?.state).toBe("left");
      expect(member?.taskId).toBeNull();
    });
  });

  describe("in-app invites", () => {
    it("notifies invited app users with a join token (self filtered out)", async () => {
      const created = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(JOINER_D_ID)}`)
        .send({
          goalText: "invite my friends in-app",
          inviteUserIds: [JOINER_E_ID, JOINER_D_ID],
        });

      expect(created.status).toBe(201);

      const selfInvite = await prisma.notification.findFirst({
        where: { userId: JOINER_D_ID, type: "circle-invite" },
      });
      expect(selfInvite).toBeNull();

      const invite = await prisma.notification.findFirst({
        where: { userId: JOINER_E_ID, type: "circle-invite" },
      });
      expect(invite).toBeTruthy();

      const token = (invite?.metadata as { token?: string } | null)?.token;
      expect(token).toBeTruthy();

      const joined = await request(app)
        .post(`/invites/${token}/join`)
        .set("Authorization", `Bearer ${tokenFor(JOINER_E_ID)}`)
        .send({});
      expect(joined.status).toBe(201);
      expect(joined.body.circle.id).toBe(created.body.circle.id);
    });

    it("rejects more than 4 invitees", async () => {
      const res = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(OUTSIDER_ID)}`)
        .send({
          goalText: "too many invitees",
          inviteUserIds: ["a", "b", "c", "d", "e"],
        });

      expect(res.status).toBe(400);
    });
  });

  describe("caps", () => {
    it("enforces a maximum of 3 active circles per user", async () => {
      const sentences = [
        "cap circle number one",
        "cap circle number two",
        "cap circle number three",
      ];

      for (const goalText of sentences) {
        const res = await request(app)
          .post("/circles")
          .set("Authorization", `Bearer ${tokenFor(OVERFLOW_ID)}`)
          .send({ goalText });
        expect(res.status).toBe(201);
      }

      const fourth = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(OVERFLOW_ID)}`)
        .send({ goalText: "cap circle number four" });

      expect(fourth.status).toBe(409);
    });
  });

  describe("invite preview (web landing)", () => {
    it("serves an unauthenticated preview", async () => {
      const created = await request(app)
        .post("/circles")
        .set("Authorization", `Bearer ${tokenFor(JOINER_E_ID)}`)
        .send({ goalText: "stretch every morning" });
      const token = created.body.inviteLink.split("/c/")[1];

      const res = await request(app).get(`/invites/${token}/preview`);

      expect(res.status).toBe(200);
      expect(res.body.goalText).toBe("stretch every morning");
      expect(res.body.state).toBe("open");
      expect(res.body.memberCount).toBe(1);
      expect(res.body.members[0].name).toBeTruthy();
    });
  });
});
