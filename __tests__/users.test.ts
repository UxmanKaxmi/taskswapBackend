import request from "supertest";
import app from "../src/index";
import { prisma } from "../src/db/client";

// ✅ Mock verifyGoogleToken to skip real token validation
jest.mock("../src/middleware/verifyGoogleToken", () => {
  return {
    verifyGoogleToken: (req: any, res: any, next: any) => {
      const auth = req.headers["authorization"];
      const testHeader = req.headers["x-test-auth"];

      if (auth?.startsWith("Bearer") && testHeader === "true") {
        // Inject mock user info
        req.body.id = "test-user-id";
        req.body.email = "test@example.com";
        req.body.name = "Test User";
        req.body.photo = "https://example.com/photo.png";
        return next();
      }

      // Simulate missing/invalid token
      return res.status(401).json({ error: "Missing or invalid token" });
    },
  };
});

describe("User Routes", () => {
  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    photo: "https://example.com/photo.png",
  };

  beforeAll(async () => {
    // First remove any tasks by this user to avoid FK violations
    await prisma.task.deleteMany({ where: { userId: mockUser.id } });
    // Then remove the user
    await prisma.user.deleteMany({ where: { id: mockUser.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should create or update a user", async () => {
    const res = await request(app)
      .post("/users")
      .set("Authorization", "Bearer test-token")
      .set("x-test-auth", "true") // ✅ Trigger mock user injection
      .send(mockUser);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("id", mockUser.id);
    expect(res.body.user.email).toBe(mockUser.email);
    expect(res.body).toHaveProperty("token");
  });

  it("should fail without Authorization header", async () => {
    const res = await request(app)
      .post("/users") // no x-test-auth header
      .send(mockUser);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Missing or invalid token");
  });
});
