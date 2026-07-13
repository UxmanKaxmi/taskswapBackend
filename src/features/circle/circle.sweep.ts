import { prisma } from "../../db/client";
import { evaluateCircleLifecycle } from "./circle.service";

// Invite expiry has no event of its own, so an hourly sweep dissolves circles
// that never reached 2 members once their last invite lapses (spec §6).

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// DB-backed lease so concurrent server instances never run the sweep twice.
const SWEEP_LOCK_NAME = "circle-lifecycle-sweep";
const SWEEP_LOCK_LEASE_MS = 30 * 60 * 1000;

let sweepRunning = false;
let sweepTimer: NodeJS.Timeout | null = null;

async function acquireSweepLock(): Promise<boolean> {
  await prisma.jobLock.createMany({
    data: [{ name: SWEEP_LOCK_NAME, lockedAt: new Date(0) }],
    skipDuplicates: true,
  });

  const { count } = await prisma.jobLock.updateMany({
    where: {
      name: SWEEP_LOCK_NAME,
      lockedAt: { lt: new Date(Date.now() - SWEEP_LOCK_LEASE_MS) },
    },
    data: { lockedAt: new Date() },
  });

  return count === 1;
}

async function releaseSweepLock() {
  await prisma.jobLock.updateMany({
    where: { name: SWEEP_LOCK_NAME },
    data: { lockedAt: new Date(0) },
  });
}

export async function runCircleLifecycleSweep() {
  const candidates = await prisma.circle.findMany({
    where: {
      status: "active",
      invites: { none: { revokedAt: null, expiresAt: { gt: new Date() } } },
    },
    select: { id: true },
  });

  for (const candidate of candidates) {
    await evaluateCircleLifecycle(candidate.id);
  }
}

export function startCircleLifecycleSweep() {
  const tick = async () => {
    if (sweepRunning) return;
    sweepRunning = true;

    try {
      if (await acquireSweepLock()) {
        try {
          await runCircleLifecycleSweep();
        } finally {
          await releaseSweepLock();
        }
      }
    } catch (error) {
      console.error("[CIRCLE_SWEEP_ERROR]", error);
    } finally {
      sweepRunning = false;
    }
  };

  void tick();
  sweepTimer = setInterval(tick, SWEEP_INTERVAL_MS);
  return sweepTimer;
}
