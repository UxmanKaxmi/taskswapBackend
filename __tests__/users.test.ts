import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";

// ✅ Mock verifyGoogleToken to skip real token validation
jest.mock("../src/middleware/verifyGoogleToken", () => ({
  verifyGoogleToken: (_req: any, _res: any, next: any) => next(),
}));

describe("User Routes", () => {
  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    photo: "https://example.com/photo.png",
  };

  beforeAll(async () => {
    // Optional: Clean up user before tests
    await prisma.user.deleteMany({ where: { id: mockUser.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should create or update a user", async () => {
    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer test-token") // Mocked anyway
      .send(mockUser);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", mockUser.id);
    expect(res.body.email).toBe(mockUser.email);
  });

  it("should fail with missing fields", async () => {
    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer test-token")
      .send({}); // Missing all required fields

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
