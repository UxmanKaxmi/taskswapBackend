// index.ts
import "./config/env";
import express, { Router } from "express"; // ✅ Add Router here
import cors from "cors";
import taskRoutes from "./features/task/task.routes";
import userRoutes from "./features/user/user.routes";
import reminderNote from "./features/reminderNote/reminderNote.routes";
import notificationRoutes from "./features/notification/notification.routes";
import voteRoutes from "./features/vote/vote.routes";
import commentRoutes from "./features/comment/comment.routes";
import referralRoutes from "./features/referral/referral.routes";
import pushRoutes from "./features/push/push.routes";
import featureFlagsRoutes from "./features/featureFlags/featureFlags.routes";
import { startNotificationReminderSweep } from "./features/notification/notificationReminderSweep.service";
import feedbackRoutes from "./features/feedback/feedback.routes";
import cheerRoutes from "./features/cheer/cheer.routes";

import { prisma } from "./db/client";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// Health-check endpoint for uptime monitoring
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, timestamp: Date.now() });
});
app.get("/test-db", async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json({ connected: true, users });
  } catch (error) {
    res.status(500).json({ connected: false });
  }
});
app.use("/tasks", taskRoutes as Router);
app.use("/users", userRoutes);
app.use("/reminderNote", reminderNote as Router);
app.use("/notification", notificationRoutes as Router);
app.use("/vote", voteRoutes as Router);
app.use("/comments", commentRoutes as Router);
app.use("/referrals", referralRoutes as Router);
app.use("/features", featureFlagsRoutes as Router);
app.use("/feedback", feedbackRoutes as Router);
app.use("/beats", cheerRoutes as Router);

// Push routes, we need Task here
app.use("/tasks", pushRoutes as Router);

app.use(errorHandler);

// ✅ Server start only after DB connection check
async function startServer() {
  try {
    await prisma.$connect();
    startNotificationReminderSweep();
    console.log("✅ Connected to the PostgreSQL database");

    app.listen(PORT,"0.0.0.0", () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  // Debug: list all routes
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
  startServer();
}

export default app;
