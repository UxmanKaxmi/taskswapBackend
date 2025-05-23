import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";

// ✅ Mock requireAuth middleware to simulate an authenticated user
jest.mock("../src/middleware/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.userId = "test-user-id"; // Inject fake userId
    next();
  },
}));

describe("Task Routes", () => {
  const mockUser = {
    id: "test-user-id",
    email: "tasktest@example.com",
    name: "Task Tester",
    photo: "https://myavatar.com/pic.jpg", // ✅ this is correct
  };

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: mockUser.id },
      update: {},
      create: mockUser,
    });
  });

  it("should create a reminder task", async () => {
    const res = await request(app).post("/tasks").send({
      text: "Test reminder task",
      type: "reminder",
      remindAt: new Date().toISOString(),
      avatar: mockUser.photo,
      name: mockUser.name,
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.text).toBe("Test reminder task");
  });

  it("should mark a reminder task as completed", async () => {
    const createRes = await request(app).post("/tasks").send({
      text: "Reminder to complete",
      type: "reminder",
      remindAt: new Date().toISOString(),
      avatar: mockUser.photo,
      name: mockUser.name,
    });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    const completeRes = await request(app).patch(`/tasks/${taskId}/complete`);
    console.log("Complete response:", completeRes.status, completeRes.body);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body).toHaveProperty("completed", true);
    expect(completeRes.body.id).toBe(taskId);
  });

  it("should create a decision task", async () => {
    const res = await request(app)
      .post("/tasks")
      .send({
        text: "Test decision task",
        type: "decision",
        options: ["Option 1", "Option 2"],
        avatar: mockUser.photo,
        name: mockUser.name,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.text).toBe("Test decision task");
  });

  it("should get all tasks", async () => {
    const res = await request(app).get("/tasks");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
