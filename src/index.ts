// index.ts
import express, { Router } from "express"; // ✅ Add Router here
import cors from "cors";
import taskRoutes from "./features/task/task.routes";
import userRoutes from "./features/user/user.routes";
import reminderNote from "./features/reminderNote/reminderNote.routes";

import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Health-check endpoint for uptime monitoring
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, timestamp: Date.now() });
});

// ✅ Tell TS explicitly this is a Router
app.use("/tasks", taskRoutes as Router);
app.use("/users", userRoutes);
app.use("/reminderNote", reminderNote as Router);

app.use(errorHandler);

export default app;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`Server running on ${PORT}`));
}
