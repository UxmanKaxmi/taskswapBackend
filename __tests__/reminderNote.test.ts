// import request from "supertest";
// import app from "../src/index";
// import { prisma } from "../src/db/client";
// import { v4 as uuidv4 } from "uuid";

// // ✅ Mock authentication
// jest.mock("../src/middleware/requireAuth", () => ({
//   requireAuth: (_req: any, _res: any, next: any) => {
//     _req.userId = "test-user-id";
//     next();
//   },
// }));

// describe("Reminder Note Feature", () => {
//   let taskId: string;
//   const uniqueText = `Send reminder ${Date.now()}`;

//   beforeAll(async () => {
//     await prisma.user.upsert({
//       where: { id: "test-user-id" },
//       update: {},
//       create: {
//         id: "test-user-id",
//         name: "Reminder Tester",
//         email: "reminder@example.com",
//         photo: "https://example.com/reminder.png",
//       },
//     });

//     await prisma.user.upsert({
//       where: { id: "task-owner-id" },
//       update: {},
//       create: {
//         id: "task-owner-id",
//         name: "Owner",
//         email: "owner@example.com",
//         photo: "https://example.com/owner.png",
//       },
//     });

//     const task = await prisma.task.create({
//       data: {
//         text: uniqueText,
//         type: "reminder",
//         remindAt: new Date().toISOString(),
//         userId: "task-owner-id",
//         avatar: "https://example.com/avatar.png",
//         name: "Owner",
//       },
//     });

//     taskId = task.id;
//   });

//   it("should allow sending a reminder to someone else's task", async () => {
//     const res = await request(app)
//       .post(`/tasks/${taskId}/remind`)
//       .send({ message: "Hello! Reminder sent." });

//     expect(res.status).toBe(201);
//     expect(res.body).toHaveProperty("id");
//     expect(res.body.message).toBe("Hello! Reminder sent.");
//   });

//   it("should prevent sending a second reminder for the same task", async () => {
//     const res = await request(app)
//       .post(`/tasks/${taskId}/remind`)
//       .send({ message: "Second try" });

//     expect(res.status).toBe(400);
//     expect(res.body.error).toMatch(/already sent/i);
//   });

//   it("should fetch all reminders for a task", async () => {
//     const res = await request(app).get(`/tasks/${taskId}/reminders`);
//     expect(res.status).toBe(200);
//     expect(Array.isArray(res.body)).toBe(true);
//     expect(res.body[0]).toHaveProperty("message");
//   });

//   it("should return hasReminded in task list", async () => {
//     const res = await request(app).get("/tasks");
//     expect(res.status).toBe(200);
//     const target = res.body.find((t: any) => t.id === taskId);
//     expect(target).toBeDefined();
//     expect(target.hasReminded).toBe(true);
//   });
// });
