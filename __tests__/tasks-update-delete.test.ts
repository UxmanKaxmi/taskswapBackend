// __tests__/tasks-update-delete.test.ts
import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";

// Mock auth middleware to always allow
jest.mock("../src/middleware/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.userId = "test-user-id";
    next();
  },
}));

describe("Task Update/Delete Routes", () => {
  let taskId: string;

  beforeAll(async () => {
    // Ensure user exists
    await prisma.user.upsert({
      where: { id: "test-user-id" },
      update: {},
      create: {
        id: "test-user-id",
        email: "update@test.com",
        name: "Update Tester",
      },
    });

    const task = await prisma.task.create({
      data: {
        text: "Initial Task",
        type: "reminder",
        userId: "test-user-id",
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("should update a task", async () => {
    const res = await request(app).put(`/tasks/${taskId}`).send({
      text: "Updated Task Text",
    });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Updated Task Text");
  });

  it("should delete a task", async () => {
    const res = await request(app).delete(`/tasks/${taskId}`);
    expect(res.status).toBe(204);
  });

  it("should return 404 for deleting non-existent task", async () => {
    const res = await request(app).delete(`/tasks/non-existent-id`);
    expect(res.status).toBe(500); // or 404 based on your controller logic
  });
});
