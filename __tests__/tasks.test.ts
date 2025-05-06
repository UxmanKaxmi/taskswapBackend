// __tests__/tasks.test.ts
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
    // Ensure user exists for foreign key
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

  it("should create a task", async () => {
    const res = await request(app).post("/tasks").send({
      text: "Test task",
      type: "reminder",
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.text).toBe("Test task");
  });

  it("should get all tasks", async () => {
    const res = await request(app).get("/tasks");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
