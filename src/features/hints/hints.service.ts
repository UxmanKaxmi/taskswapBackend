import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import {
  FirstTimeHintId,
  FirstTimeHintMap,
  FirstTimeHintState,
} from "./hints.types";

export function normalizeFirstTimeHints(value: unknown): FirstTimeHintMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as FirstTimeHintMap;
}

// Write one hint's state. Idempotent; "completed" is terminal — a later
// "dismissed" (from a stale client) never downgrades it, so funnels keep
// the truth that the action happened.
export async function writeFirstTimeHintState(
  userId: string,
  hintId: FirstTimeHintId,
  state: FirstTimeHintState
): Promise<FirstTimeHintMap> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstTimeHints: true },
  });

  if (!user) {
    throw new AppError("User not found", HttpStatus.NOT_FOUND);
  }

  const hints = normalizeFirstTimeHints(user.firstTimeHints);
  const current = hints[hintId]?.state;

  if (current === "completed" || current === state) {
    return hints;
  }

  const next: FirstTimeHintMap = {
    ...hints,
    [hintId]: { state, at: new Date().toISOString() },
  };

  await prisma.user.update({
    where: { id: userId },
    data: { firstTimeHints: next as Prisma.InputJsonValue },
  });

  return next;
}

// Self-scoped testing convenience: wipes the caller's own map back to
// all-pending so the hints re-teach. Harmless by construction — a user can
// only re-enable their own teaching moments.
export async function resetFirstTimeHints(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { firstTimeHints: {} },
  });
}

// Completion backstop called from the push/cheer/progress mutations so the
// hint is recorded even when the client's own write is missed. Must never
// fail the primary action.
export async function completeFirstTimeHint(
  userId: string,
  hintId: FirstTimeHintId
): Promise<void> {
  try {
    await writeFirstTimeHintState(userId, hintId, "completed");
  } catch (error) {
    console.error(
      `Failed to record first-time hint '${hintId}' for user ${userId}:`,
      error
    );
  }
}
