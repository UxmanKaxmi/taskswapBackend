import { prisma } from "../../db/client";
import { SubmitFeedbackInput } from "./feedback.schema";

export async function createFeedback(
  input: SubmitFeedbackInput,
  authUserId?: string
) {
  // Prefer the authenticated user; fall back to the id the client reported.
  const userId = authUserId ?? input.loggedInUserId ?? null;

  // Only link the feedback to a user that actually exists, so a stale/guest id
  // can't break the insert via the foreign key.
  let linkedUserId: string | null = null;
  if (userId) {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    linkedUserId = exists ? userId : null;
  }

  return prisma.feedback.create({
    data: {
      category: input.category ?? null,
      message: input.message,
      appVersion: input.appVersion,
      platform: input.platform,
      device: input.device ?? null,
      osVersion: input.osVersion ?? null,
      currentScreen: input.currentScreen ?? null,
      timeSubmitted: input.timeSubmitted,
      userId: linkedUserId,
    },
    select: { id: true, createdAt: true },
  });
}
