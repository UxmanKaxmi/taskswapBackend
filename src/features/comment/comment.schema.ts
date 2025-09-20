import { z } from "zod";

// Schema for creating a comment
export const createCommentSchema = z.object({
  text: z.string().min(1, "Comment text is required"),
  taskId: z.string().uuid(),
  mentions: z.array(z.string().regex(/^\d+$/, "Must be a numeric ID")), // ✅ only digits
});
