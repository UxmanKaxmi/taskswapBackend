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
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json()); // ✅ Needed to populate req.body
// Health-check endpoint for uptime monitoring
app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, timestamp: Date.now() });
});
app.use("/tasks", task_routes_1.default);
app.use("/users", user_routes_1.default);
app.use("/reminderNote", reminderNote_routes_1.default);
app.use("/notification", notification_routes_1.default);
app.use(errorHandler_1.errorHandler);
exports.default = app;
if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
}
