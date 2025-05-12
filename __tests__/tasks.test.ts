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
    photo: null,
  };

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: mockUser.id },
      update: {},
      create: mockUser,
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { userId: mockUser.id } });
    await prisma.user.delete({ where: { id: mockUser.id } });
    await prisma.$disconnect();
  });

  it("should create a reminder task", async () => {
    const res = await request(app).post("/tasks").send({
      text: "Test reminder task",
      type: "reminder",
      remindAt: new Date().toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.text).toBe("Test reminder task");
  });

  it("should create a decision task", async () => {
    const res = await request(app)
      .post("/tasks")
      .send({
        text: "Test decision task",
        type: "decision",
        options: ["Option 1", "Option 2"],
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
