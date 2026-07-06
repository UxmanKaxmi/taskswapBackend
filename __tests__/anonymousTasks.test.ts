import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";
import jwt from "jsonwebtoken";

const OWNER_ID = "anon-owner-1";
const OWNER_NAME = "Real Owner Name";
const VIEWER_ID = "anon-viewer-1";

const tokenFor = (userId: string) =>
  jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });

const OWNER_PHOTO = "http://x/owner-secret-photo.jpg";

const createTestUser = (id: string, email: string, name: string, photo: string) =>
  prisma.user.create({ data: { id, email, name, photo } });

// Assert a payload never mentions the owner's identity anywhere in the JSON.
function assertNoOwnerLeak(payload: unknown) {
  const raw = JSON.stringify(payload);
  expect(raw).not.toContain(OWNER_ID);
  expect(raw).not.toContain(OWNER_NAME);
  expect(raw).not.toContain(OWNER_PHOTO);
}

describe("Anonymous tasks", () => {
  let taskId: string;

  beforeAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.push.deleteMany();
    await prisma.task.deleteMany();
    await prisma.user.deleteMany();

    await createTestUser(OWNER_ID, "anon-owner@test.com", OWNER_NAME, OWNER_PHOTO);
    await createTestUser(VIEWER_ID, "anon-viewer@test.com", "Viewer Person", "http://x/viewer.jpg");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates an anonymous task with a generated alias", async () => {
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ type: "motivation", text: "quit vaping for real" });

    expect(res.status).toBe(201);

    const res2 = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ type: "motivation", text: "call the dentist", isAnonymous: true });

    expect(res2.status).toBe(201);
    taskId = res2.body.id;

    const row = await prisma.task.findUnique({ where: { id: taskId } });
    expect(row?.isAnonymous).toBe(true);
    expect(row?.anonAlias).toBeTruthy();
    expect(row?.userId).toBe(OWNER_ID); // real authorship kept internally
  });

  it("rejects a second active anonymous task", async () => {
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ type: "motivation", text: "another secret goal", isAnonymous: true });

    expect(res.status).toBe(409);
  });

  it("rejects helpers on anonymous tasks", async () => {
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`)
      .send({
        type: "motivation",
        text: "anon with helpers",
        isAnonymous: true,
        helpers: [OWNER_ID],
      });

    expect(res.status).toBe(400);
  });

  it("never leaks the owner in the public feed", async () => {
    const res = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`);

    expect(res.status).toBe(200);
    const anonTask = res.body.data.find((t: any) => t.id === taskId);
    expect(anonTask).toBeTruthy();
    expect(anonTask.isAnonymous).toBe(true);
    expect(anonTask.userId).toBe(`anon:${taskId}`);
    assertNoOwnerLeak(anonTask);
  });

  it("never leaks the owner in task detail (auth + unauth)", async () => {
    const asViewer = await request(app)
      .get(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`);
    expect(asViewer.status).toBe(200);
    assertNoOwnerLeak(asViewer.body);

    const unauthed = await request(app).get(`/tasks/${taskId}`);
    expect(unauthed.status).toBe(200);
    assertNoOwnerLeak(unauthed.body);
  });

  it("shows the owner their own task unmasked", async () => {
    const res = await request(app)
      .get(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(OWNER_ID);
    expect(res.body.name).toBe(OWNER_NAME);
    expect(res.body.isAnonymous).toBe(true);
  });

  it("excludes anonymous tasks from the owner's public profile", async () => {
    const res = await request(app)
      .get(`/users/${OWNER_ID}/profile`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`);

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("call the dentist");
    expect(raw).toContain("quit vaping for real"); // named task still shows
  });

  it("masks the owner's own comments but keeps supporters named", async () => {
    const c1 = await request(app)
      .post("/comments")
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`)
      .send({ taskId, text: "you got this!", mentions: [] });
    expect(c1.status).toBe(201);

    const c2 = await request(app)
      .post("/comments")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ taskId, text: "thanks, trying", mentions: [] });
    expect(c2.status).toBe(201);

    const res = await request(app)
      .get(`/comments/${taskId}`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`);

    expect(res.status).toBe(200);
    assertNoOwnerLeak(res.body);

    const supporterComment = res.body.find((c: any) => c.text === "you got this!");
    expect(supporterComment.user.name).toBe("Viewer Person");
  });

  it("rejects named→anon via update", async () => {
    const namedTask = await prisma.task.findFirst({
      where: { userId: OWNER_ID, isAnonymous: false },
    });

    const res = await request(app)
      .patch(`/tasks/${namedTask!.id}`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ isAnonymous: true });

    expect(res.status).toBe(400);
  });

  it("reveals anon→named via the reveal endpoint (owner only)", async () => {
    const asViewer = await request(app)
      .post(`/tasks/${taskId}/reveal`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`);
    expect(asViewer.status).toBe(401);

    const asOwner = await request(app)
      .post(`/tasks/${taskId}/reveal`)
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.isAnonymous).toBe(false);

    // Now visible with the real name
    const detail = await request(app)
      .get(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${tokenFor(VIEWER_ID)}`);
    expect(detail.body.userId).toBe(OWNER_ID);
    expect(detail.body.name).toBe(OWNER_NAME);

    // And the anon slot is free again
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ type: "motivation", text: "new secret goal", isAnonymous: true });
    expect(res.status).toBe(201);
  });
});
