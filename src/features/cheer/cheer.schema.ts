import { z } from "zod";

export const cheerSchema = z.object({
  presetKey: z.string().min(1),
});
