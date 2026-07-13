import "./config/env";
import express, { RequestHandler, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import taskRoutes from "./features/task/task.routes";
import userRoutes from "./features/user/user.routes";
import reminderNote from "./features/reminderNote/reminderNote.routes";
import notificationRoutes from "./features/notification/notification.routes";
import voteRoutes from "./features/vote/vote.routes";
import commentRoutes from "./features/comment/comment.routes";
import referralRoutes from "./features/referral/referral.routes";
import pushRoutes from "./features/push/push.routes";
import featureFlagsRoutes from "./features/featureFlags/featureFlags.routes";
import firstTimeHintRoutes from "./features/hints/hints.routes";
import { startNotificationReminderSweep } from "./features/notification/notificationReminderSweep.service";
import { startScheduledPushDispatcher } from "./features/notification/scheduledPush.service";
import feedbackRoutes from "./features/feedback/feedback.routes";
import cheerRoutes from "./features/cheer/cheer.routes";
import {
  adminModerationRoutes,
  taskModerationRoutes,
  userModerationRoutes,
} from "./features/moderation/moderation.routes";
import {
  circleRoutes,
  circleInviteRoutes,
} from "./features/circle/circle.routes";
import { startCircleLifecycleSweep } from "./features/circle/circle.sweep";

import { prisma } from "./db/client";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

function getPositiveIntEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getTrustProxySetting() {
  const configured = process.env.TRUST_PROXY;

  if (!configured) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }

  if (configured === "true") return 1;
  if (configured === "false") return false;

  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : false;
}

app.set("trust proxy", getTrustProxySetting());
app.use(helmet());

// Restrict CORS to configured origins when ALLOWED_ORIGINS is set
// (comma-separated). Falls back to permissive in non-production so local
// dev keeps working; production must set ALLOWED_ORIGINS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length > 0
      ? { origin: allowedOrigins, credentials: true }
      : undefined
  )
);
app.use(express.json());

// Basic rate limiting across all routes; write-heavy endpoints get a tighter
// limit registered below.
const enableRateLimits = process.env.NODE_ENV !== "test";
const rateLimitWindowMs = getPositiveIntEnv(
  "RATE_LIMIT_WINDOW_MS",
  15 * 60 * 1000
);
const globalRateLimitMax = getPositiveIntEnv(
  "GLOBAL_RATE_LIMIT_MAX",
  process.env.NODE_ENV === "production" ? 1200 : 5000
);
const writeRateLimitMax = getPositiveIntEnv(
  "WRITE_RATE_LIMIT_MAX",
  process.env.NODE_ENV === "production" ? 100 : 1000
);
const rateLimitMessage = {
  error: "Too many requests. Please wait a moment and try again.",
};

if (enableRateLimits) {
  app.use(
    rateLimit({
      windowMs: rateLimitWindowMs,
      max: globalRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: rateLimitMessage,
      skip: (req) => req.path === "/health",
    })
  );
}

// Tighter limit for mutations only. Mounted on routers that also serve reads,
// so skip safe methods — GET/HEAD are covered by the global limiter above and
// must not be throttled (e.g. feed pagination, opening task detail).
const noopLimiter: RequestHandler = (_req, _res, next) => next();
const writeLimiter = enableRateLimits
  ? rateLimit({
      windowMs: rateLimitWindowMs,
      max: writeRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: rateLimitMessage,
      skip: (req) => req.method === "GET" || req.method === "HEAD",
    })
  : noopLimiter;

// Health-check endpoint for uptime monitoring
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, timestamp: Date.now() });
});

// Debug-only DB connectivity probe. Never exposed outside development —
// it returns every user row.
if (process.env.NODE_ENV === "development") {
  app.get("/test-db", async (req, res) => {
    try {
      const users = await prisma.user.findMany();
      res.json({ connected: true, users });
    } catch (error) {
      res.status(500).json({ connected: false });
    }
  });
}
app.use("/tasks", writeLimiter, taskModerationRoutes as Router);
app.use("/tasks", writeLimiter, taskRoutes as Router);
app.use("/users", writeLimiter, userModerationRoutes as Router);
app.use("/users/me/hints", writeLimiter, firstTimeHintRoutes as Router);
app.use("/users", userRoutes);
app.use("/reminderNote", reminderNote as Router);
app.use("/notification", notificationRoutes as Router);
app.use("/vote", writeLimiter, voteRoutes as Router);
app.use("/comments", writeLimiter, commentRoutes as Router);
app.use("/referrals", referralRoutes as Router);
app.use("/features", featureFlagsRoutes as Router);
app.use("/feedback", writeLimiter, feedbackRoutes as Router);
app.use("/beats", writeLimiter, cheerRoutes as Router);
app.use("/circles", writeLimiter, circleRoutes as Router);
app.use("/invites", writeLimiter, circleInviteRoutes as Router);
app.use("/admin", writeLimiter, adminModerationRoutes as Router);

// Push routes, we need Task here
app.use("/tasks", writeLimiter, pushRoutes as Router);

app.use(errorHandler);

// ✅ Server start only after DB connection check
async function startServer() {
  try {
    await prisma.$connect();
    startNotificationReminderSweep();
    startScheduledPushDispatcher();
    startCircleLifecycleSweep();
    console.log("✅ Connected to the PostgreSQL database");

    app.listen(PORT,"0.0.0.0", () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV === "development") {
  // Debug: list all routes (development only — leaks the API surface)
  app.get("/routes", (_req, res) => {
    const routes: string[] = [];

    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        // Route registered directly on the app
        routes.push(middleware.route.path);
      } else if (middleware.name === "router") {
        // Router middleware
        middleware.handle.stack.forEach((handler: any) => {
          const fullPath =
            (middleware.regexp?.toString() || "") + handler.route.path;
          routes.push(fullPath);
        });
      }
    });

    res.json({ routes });
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
