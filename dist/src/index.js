"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// index.ts
const express_1 = __importDefault(require("express")); // ✅ Add Router here
const cors_1 = __importDefault(require("cors"));
const task_routes_1 = __importDefault(require("./features/task/task.routes"));
const user_routes_1 = __importDefault(require("./features/user/user.routes"));
const reminderNote_routes_1 = __importDefault(require("./features/reminderNote/reminderNote.routes"));
const notification_routes_1 = __importDefault(require("./features/notification/notification.routes"));
const vote_routes_1 = __importDefault(require("./features/vote/vote.routes"));
const comment_routes_1 = __importDefault(require("./features/comment/comment.routes"));
const client_1 = require("@prisma/client");
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = 3001;
const prisma = new client_1.PrismaClient();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health-check endpoint for uptime monitoring
app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, timestamp: Date.now() });
});
app.get("/test-db", async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json({ connected: true, users });
    }
    catch (error) {
        res.status(500).json({ connected: false });
    }
});
app.use("/tasks", task_routes_1.default);
app.use("/users", user_routes_1.default);
app.use("/reminderNote", reminderNote_routes_1.default);
app.use("/notification", notification_routes_1.default);
app.use("/vote", vote_routes_1.default);
app.use("/comments", comment_routes_1.default);
app.use(errorHandler_1.errorHandler);
// ✅ Server start only after DB connection check
async function startServer() {
    try {
        await prisma.$connect();
        console.log("✅ Connected to the PostgreSQL database at:", process.env.DATABASE_URL);
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("❌ Failed to connect to the database:", error);
        process.exit(1);
    }
}
if (process.env.NODE_ENV !== "test") {
    // Debug: list all routes
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
    startServer();
}
exports.default = app;
