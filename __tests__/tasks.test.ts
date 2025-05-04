import request from "supertest";
import app from "../src/index"; // export `app` from your index.ts

describe("Task Routes", () => {
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
