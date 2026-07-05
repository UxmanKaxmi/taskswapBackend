import { z } from "zod";

// Schema for creating a comment
export const createCommentSchema = z.object({
  text: z.string().min(1, "Comment text is required").max(1000, "Comment is too long"),
  taskId: z.string().uuid(),
  mentions: z.array(z.string().regex(/^\d+$/, "Must be a numeric ID")), // ✅ only digits
});
