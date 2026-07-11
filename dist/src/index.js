"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const task_routes_1 = __importDefault(require("./features/task/task.routes"));
const user_routes_1 = __importDefault(require("./features/user/user.routes"));
const reminderNote_routes_1 = __importDefault(require("./features/reminderNote/reminderNote.routes"));
const notification_routes_1 = __importDefault(require("./features/notification/notification.routes"));
const vote_routes_1 = __importDefault(require("./features/vote/vote.routes"));
const comment_routes_1 = __importDefault(require("./features/comment/comment.routes"));
const referral_routes_1 = __importDefault(require("./features/referral/referral.routes"));
const push_routes_1 = __importDefault(require("./features/push/push.routes"));
const featureFlags_routes_1 = __importDefault(require("./features/featureFlags/featureFlags.routes"));
const notificationReminderSweep_service_1 = require("./features/notification/notificationReminderSweep.service");
const scheduledPush_service_1 = require("./features/notification/scheduledPush.service");
const feedback_routes_1 = __importDefault(require("./features/feedback/feedback.routes"));
const cheer_routes_1 = __importDefault(require("./features/cheer/cheer.routes"));
const moderation_routes_1 = require("./features/moderation/moderation.routes");
const client_1 = require("./db/client");
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 3001;
function getPositiveIntEnv(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function getTrustProxySetting() {
    const configured = process.env.TRUST_PROXY;
    if (!configured) {
        return process.env.NODE_ENV === "production" ? 1 : false;
    }
    if (configured === "true")
        return 1;
    if (configured === "false")
        return false;
    const parsed = Number.parseInt(configured, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : false;
}
app.set("trust proxy", getTrustProxySetting());
app.use((0, helmet_1.default)());
// Restrict CORS to configured origins when ALLOWED_ORIGINS is set
// (comma-separated). Falls back to permissive in non-production so local
// dev keeps working; production must set ALLOWED_ORIGINS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)(allowedOrigins.length > 0
    ? { origin: allowedOrigins, credentials: true }
    : undefined));
app.use(express_1.default.json());
// Basic rate limiting across all routes; write-heavy endpoints get a tighter
// limit registered below.
const enableRateLimits = process.env.NODE_ENV !== "test";
const rateLimitWindowMs = getPositiveIntEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
const globalRateLimitMax = getPositiveIntEnv("GLOBAL_RATE_LIMIT_MAX", process.env.NODE_ENV === "production" ? 1200 : 5000);
const writeRateLimitMax = getPositiveIntEnv("WRITE_RATE_LIMIT_MAX", process.env.NODE_ENV === "production" ? 100 : 1000);
const rateLimitMessage = {
    error: "Too many requests. Please wait a moment and try again.",
};
if (enableRateLimits) {
    app.use((0, express_rate_limit_1.default)({
        windowMs: rateLimitWindowMs,
        max: globalRateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
        message: rateLimitMessage,
        skip: (req) => req.path === "/health",
    }));
}
// Tighter limit for mutations only. Mounted on routers that also serve reads,
// so skip safe methods — GET/HEAD are covered by the global limiter above and
// must not be throttled (e.g. feed pagination, opening task detail).
const noopLimiter = (_req, _res, next) => next();
const writeLimiter = enableRateLimits
    ? (0, express_rate_limit_1.default)({
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
            const users = await client_1.prisma.user.findMany();
            res.json({ connected: true, users });
        }
        catch (error) {
            res.status(500).json({ connected: false });
        }
    });
}
app.use("/tasks", writeLimiter, moderation_routes_1.taskModerationRoutes);
app.use("/tasks", writeLimiter, task_routes_1.default);
app.use("/users", writeLimiter, moderation_routes_1.userModerationRoutes);
app.use("/users", user_routes_1.default);
app.use("/reminderNote", reminderNote_routes_1.default);
app.use("/notification", notification_routes_1.default);
app.use("/vote", writeLimiter, vote_routes_1.default);
app.use("/comments", writeLimiter, comment_routes_1.default);
app.use("/referrals", referral_routes_1.default);
app.use("/features", featureFlags_routes_1.default);
app.use("/feedback", writeLimiter, feedback_routes_1.default);
app.use("/beats", writeLimiter, cheer_routes_1.default);
app.use("/admin", writeLimiter, moderation_routes_1.adminModerationRoutes);
// Push routes, we need Task here
app.use("/tasks", writeLimiter, push_routes_1.default);
app.use(errorHandler_1.errorHandler);
// ✅ Server start only after DB connection check
async function startServer() {
    try {
        await client_1.prisma.$connect();
        (0, notificationReminderSweep_service_1.startNotificationReminderSweep)();
        (0, scheduledPush_service_1.startScheduledPushDispatcher)();
        console.log("✅ Connected to the PostgreSQL database");
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("❌ Failed to connect to the database:", error);
        process.exit(1);
    }
}
if (process.env.NODE_ENV === "development") {
    // Debug: list all routes (development only — leaks the API surface)
    app.get("/routes", (_req, res) => {
        const routes = [];
        app._router.stack.forEach((middleware) => {
            if (middleware.route) {
                // Route registered directly on the app
                routes.push(middleware.route.path);
            }
            else if (middleware.name === "router") {
                // Router middleware
                middleware.handle.stack.forEach((handler) => {
                    const fullPath = (middleware.regexp?.toString() || "") + handler.route.path;
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
exports.default = app;
