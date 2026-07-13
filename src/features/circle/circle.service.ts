import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { assertPostableContent } from "../../utils/contentModeration";
import {
  getCircleCompleteNotificationMessage,
  getCircleCompletePushText,
  getCircleDissolvedNotificationMessage,
  getCircleInviteNotificationMessage,
  getCircleInvitePushText,
  getCircleMemberDoneNotificationMessage,
  getCircleMemberDonePushText,
  getCircleMemberJoinedNotificationMessage,
  getCircleMemberJoinedPushText,
  getCircleNudgeNotificationMessage,
  getCircleNudgePushText,
  getCircleProgressUpdateNotificationMessage,
  getCircleProgressUpdatePushText,
} from "../../utils/notificationTextCatalog";
import { getBlockedUserIdsForViewer } from "../moderation/moderation.service";
import { togglePushForTask } from "../push/push.service";
import { completeFirstTimeHint } from "../hints/hints.service";
import { getGlobalFeatureFlags } from "../featureFlags/globalFlags";
import { FeelingTag } from "../task/task.types";
import { sendCircleNotifications, startOfToday } from "./circle.notifications";
import {
  CIRCLE_MAX_MEMBERS,
  toCircleDetail,
  toCircleFeedCard,
  toCircleInvitePreview,
  toCircleSummary,
} from "./circle.serializers";
import {
  CircleActivityEventDTO,
  CircleDetailDTO,
  CircleFeedCard,
  CircleInvitePreviewDTO,
} from "./circle.types";

export type { CircleFeedCard } from "./circle.types";

const CIRCLE_MAX_ACTIVE_PER_USER = 3;
const CIRCLE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CIRCLE_FEED_CARD_LIMIT = 10;

// Matches the referral web origin; /c/:token is the invite landing page.
const APP_WEB_ORIGIN = "https://pushmeup.app";

export function buildCircleInviteLink(token: string) {
  return `${APP_WEB_ORIGIN}/c/${token}`;
}

const memberUserSelect = { select: { id: true, name: true, photo: true } } as const;

const memberTaskSelect = {
  select: {
    id: true,
    feeling: true,
    createdAt: true,
    completed: true,
    pushCount: true,
    latestActivityAt: true,
    progressUpdates: {
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: {
        text: true,
        createdAt: true,
        // Reactions ride the update's beat via the existing cheer machinery.
        beat: { select: { id: true, _count: { select: { cheers: true } } } },
      },
    },
  },
} as const;

/* -------------------------------------------------------
   INTERNAL HELPERS
--------------------------------------------------------- */

async function assertUnderActiveCircleCap(userId: string) {
  const activeCount = await prisma.circleMember.count({
    where: { userId, state: "active", circle: { status: "active" } },
  });

  if (activeCount >= CIRCLE_MAX_ACTIVE_PER_USER) {
    throw new AppError(
      `You're already in ${CIRCLE_MAX_ACTIVE_PER_USER} circles. Finish one before starting another.`,
      HttpStatus.CONFLICT
    );
  }
}

// Detach member tasks back to solo. Runs OUTSIDE transactions on purpose: the
// partial unique index (text+userId on solo tasks) can reject a detach when
// the member also has an identical solo task — in that rare case the task
// keeps its circleId (membership state alone drives rendering) and a P2002
// inside a transaction would abort every other statement with it.
async function detachTasksFromCircle(taskIds: string[]) {
  for (const taskId of taskIds) {
    try {
      await prisma.task.update({
        where: { id: taskId },
        data: { circleId: null },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2025")
      ) {
        continue;
      }
      throw error;
    }
  }
}

async function getMembershipWithTask(circleId: string, userId: string) {
  return prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId } },
  });
}

// In-app invites: friends already on PushMeUp get a notification that
// deep-links to the join screen. External friends ride the share sheet —
// the same multi-use token backs both paths.
async function sendCircleInviteNotifications({
  circleId,
  inviterId,
  inviterName,
  goalText,
  token,
  inviteUserIds,
}: {
  circleId: string;
  inviterId: string;
  inviterName: string;
  goalText: string;
  token: string;
  inviteUserIds: string[];
}) {
  const candidateIds = [...new Set(inviteUserIds)].filter((id) => id !== inviterId);
  if (candidateIds.length === 0) return;

  const blockedIds = new Set(await getBlockedUserIdsForViewer(inviterId));
  const recipients = await prisma.user.findMany({
    where: { id: { in: candidateIds.filter((id) => !blockedIds.has(id)) } },
    select: { id: true },
  });

  await sendCircleNotifications({
    circleId,
    recipientIds: recipients.map((recipient) => recipient.id),
    senderId: inviterId,
    type: NOTIFICATION_TYPES.CIRCLE_INVITE,
    message: getCircleInviteNotificationMessage(),
    push: getCircleInvitePushText(inviterName, goalText),
    metadata: { taskText: goalText, token },
    pushData: {
      token,
      deeplinkPath: `/c/${token}`,
      screen: "JoinCircle",
    },
  });
}

/* -------------------------------------------------------
   LIFECYCLE — complete when everyone won, dissolve when
   fewer than 2 remain and no invite can still change that.
--------------------------------------------------------- */

export async function evaluateCircleLifecycle(circleId: string) {
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    include: {
      members: {
        where: { state: { in: ["active", "done"] } },
        select: { userId: true, state: true },
      },
      invites: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      },
    },
  });

  if (!circle || circle.status !== "active") return;

  const activeMembers = circle.members.filter((member) => member.state === "active");
  const doneMembers = circle.members.filter((member) => member.state === "done");

  if (activeMembers.length === 0 && doneMembers.length >= 2) {
    await prisma.circle.update({
      where: { id: circleId },
      data: { status: "complete", completedAt: new Date() },
    });

    await sendCircleNotifications({
      circleId,
      recipientIds: doneMembers.map((member) => member.userId),
      type: NOTIFICATION_TYPES.CIRCLE_COMPLETE,
      message: getCircleCompleteNotificationMessage(),
      push: getCircleCompletePushText(doneMembers.length),
      bypassCap: true,
      metadata: { taskText: circle.goalText },
    });
    return;
  }

  // A creator alone inside the invite window is a circle still forming, not
  // a dissolve candidate — only dissolve once no live invite can fill it.
  if (circle.members.length < 2 && circle.invites.length === 0) {
    await prisma.circle.update({
      where: { id: circleId },
      data: { status: "dissolved", dissolvedAt: new Date() },
    });

    const memberTasks = await prisma.task.findMany({
      where: { circleId },
      select: { id: true },
    });
    await detachTasksFromCircle(memberTasks.map((task) => task.id));

    // Quiet by design: in-app only, no push banner, no public trace.
    await sendCircleNotifications({
      circleId,
      recipientIds: circle.members.map((member) => member.userId),
      type: NOTIFICATION_TYPES.CIRCLE_DISSOLVED,
      message: getCircleDissolvedNotificationMessage(),
      bypassCap: true,
      metadata: { taskText: circle.goalText },
    });
  }
}

/* -------------------------------------------------------
   CREATE CIRCLE (auth required)
--------------------------------------------------------- */

export async function createCircle({
  userId,
  goalText,
  feeling,
  isAnonymous,
  inviteUserIds,
}: {
  userId: string;
  goalText: string;
  feeling?: FeelingTag | null;
  isAnonymous?: boolean;
  inviteUserIds?: string[];
}) {
  // Circles and anonymity are mutually exclusive (spec §3) — enforced on both
  // sides; the composer disables the combination, the server rejects it.
  if (isAnonymous) {
    throw new AppError(
      "A circle can't be anonymous. Everyone in it shows up as themselves.",
      HttpStatus.BAD_REQUEST
    );
  }

  assertPostableContent([goalText]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, photo: true },
  });

  if (!user) {
    throw new AppError("User not found.", HttpStatus.FORBIDDEN);
  }

  await assertUnderActiveCircleCap(userId);

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + CIRCLE_INVITE_TTL_MS);

  const { circle, task } = await prisma.$transaction(async (tx) => {
    const circle = await tx.circle.create({
      data: { goalText, createdById: userId },
    });

    const task = await tx.task.create({
      data: {
        text: goalText,
        type: "motivation",
        userId,
        isPublic: true,
        avatar: user.photo ?? "",
        name: user.name,
        feeling: feeling ?? null,
        circleId: circle.id,
      },
    });

    await tx.taskBeat.create({
      data: { taskId: task.id, type: "post", createdAt: task.createdAt },
    });

    await tx.circleMember.create({
      data: { circleId: circle.id, userId, taskId: task.id },
    });

    await tx.circleInvite.create({
      data: { circleId: circle.id, token, invitedById: userId, expiresAt },
    });

    return { circle, task };
  });

  await completeFirstTimeHint(userId, "first_goal_posted");

  await sendCircleInviteNotifications({
    circleId: circle.id,
    inviterId: userId,
    inviterName: user.name,
    goalText,
    token,
    inviteUserIds: inviteUserIds ?? [],
  });

  return {
    circle: toCircleSummary(circle),
    task,
    inviteLink: buildCircleInviteLink(token),
    inviteExpiresAt: expiresAt.toISOString(),
  };
}

/* -------------------------------------------------------
   INVITES (members only, cap 5 concurrent members)
--------------------------------------------------------- */

export async function createCircleInvite(userId: string, circleId: string) {
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    include: {
      members: {
        where: { state: { in: ["active", "done"] } },
        select: { userId: true },
      },
    },
  });

  if (!circle) {
    throw new AppError("Circle not found.", HttpStatus.NOT_FOUND);
  }

  if (!circle.members.some((member) => member.userId === userId)) {
    throw new AppError("Only members can invite to a circle.", HttpStatus.FORBIDDEN);
  }

  if (circle.status !== "active") {
    throw new AppError("This circle has wrapped up.", HttpStatus.CONFLICT);
  }

  if (circle.members.length >= CIRCLE_MAX_MEMBERS) {
    throw new AppError("This circle is full.", HttpStatus.CONFLICT);
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + CIRCLE_INVITE_TTL_MS);

  await prisma.circleInvite.create({
    data: { circleId, token, invitedById: userId, expiresAt },
  });

  return {
    inviteLink: buildCircleInviteLink(token),
    inviteExpiresAt: expiresAt.toISOString(),
  };
}

export async function getCircleInvitePreview(
  token: string
): Promise<CircleInvitePreviewDTO> {
  const invite = await prisma.circleInvite.findUnique({
    where: { token },
    include: {
      circle: {
        include: {
          members: {
            where: { state: { in: ["active", "done"] } },
            orderBy: { joinedAt: "asc" },
            include: { user: memberUserSelect },
          },
        },
      },
    },
  });

  if (!invite) {
    throw new AppError("Invite not found.", HttpStatus.NOT_FOUND);
  }

  return toCircleInvitePreview(invite);
}

/* -------------------------------------------------------
   JOIN BY TOKEN (auth required)
   Tokens are multi-use until the circle is full; duplicate
   joins are idempotent and return the existing membership.
--------------------------------------------------------- */

export async function joinCircleByToken({
  userId,
  token,
  feeling,
}: {
  userId: string;
  token: string;
  feeling?: FeelingTag | null;
}) {
  const invite = await prisma.circleInvite.findUnique({
    where: { token },
    include: { circle: true },
  });

  if (!invite) {
    throw new AppError("Invite not found.", HttpStatus.NOT_FOUND);
  }

  if (invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new AppError("This invite has expired.", HttpStatus.GONE);
  }

  if (invite.circle.status !== "active") {
    throw new AppError("This circle has wrapped up.", HttpStatus.GONE);
  }

  const circleId = invite.circleId;

  const existingMember = await getMembershipWithTask(circleId, userId);
  if (existingMember && existingMember.state !== "left") {
    const task = existingMember.taskId
      ? await prisma.task.findUnique({ where: { id: existingMember.taskId } })
      : null;
    return {
      circle: toCircleSummary(invite.circle),
      member: existingMember,
      task,
      alreadyMember: true,
    };
  }

  await assertUnderActiveCircleCap(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, photo: true },
  });

  if (!user) {
    throw new AppError("User not found.", HttpStatus.FORBIDDEN);
  }

  let member;
  let task;
  try {
    ({ member, task } = await prisma.$transaction(async (tx) => {
      // Row-lock the circle so concurrent joins can't race past the seat
      // count (same technique as the cheer service's task lock).
      await tx.$queryRaw`SELECT id FROM "Circle" WHERE id = ${circleId} FOR UPDATE`;

      const seatedCount = await tx.circleMember.count({
        where: { circleId, state: { in: ["active", "done"] } },
      });

      if (seatedCount >= CIRCLE_MAX_MEMBERS) {
        throw new AppError("This circle is full.", HttpStatus.CONFLICT);
      }

      const task = await tx.task.create({
        data: {
          text: invite.circle.goalText,
          type: "motivation",
          userId,
          isPublic: true,
          avatar: user.photo ?? "",
          name: user.name,
          feeling: feeling ?? null,
          circleId,
        },
      });

      await tx.taskBeat.create({
        data: { taskId: task.id, type: "post", createdAt: task.createdAt },
      });

      const member = existingMember
        ? await tx.circleMember.update({
            where: { id: existingMember.id },
            data: {
              state: "active",
              taskId: task.id,
              inviteId: invite.id,
              joinedAt: new Date(),
              leftAt: null,
              doneAt: null,
            },
          })
        : await tx.circleMember.create({
            data: { circleId, userId, taskId: task.id, inviteId: invite.id },
          });

      return { member, task };
    }));
  } catch (error) {
    // Duplicate join race: someone else created this membership first.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await getMembershipWithTask(circleId, userId);
      if (raced) {
        const racedTask = raced.taskId
          ? await prisma.task.findUnique({ where: { id: raced.taskId } })
          : null;
        return {
          circle: toCircleSummary(invite.circle),
          member: raced,
          task: racedTask,
          alreadyMember: true,
        };
      }
    }
    throw error;
  }

  await completeFirstTimeHint(userId, "first_goal_posted");

  const otherMembers = await prisma.circleMember.findMany({
    where: { circleId, state: "active", userId: { not: userId } },
    select: { userId: true },
  });

  await sendCircleNotifications({
    circleId,
    recipientIds: otherMembers.map((other) => other.userId),
    senderId: userId,
    type: NOTIFICATION_TYPES.CIRCLE_MEMBER_JOINED,
    message: getCircleMemberJoinedNotificationMessage(),
    push: getCircleMemberJoinedPushText(user.name, invite.circle.goalText),
    metadata: { taskText: invite.circle.goalText },
  });

  return {
    circle: toCircleSummary(invite.circle),
    member,
    task,
    alreadyMember: false,
  };
}

/* -------------------------------------------------------
   LEAVE (silent — no notification, no feed event)
--------------------------------------------------------- */

export async function leaveCircle(userId: string, circleId: string) {
  const member = await getMembershipWithTask(circleId, userId);

  if (!member) {
    throw new AppError("You're not in this circle.", HttpStatus.NOT_FOUND);
  }

  // Idempotent: repeating a leave (or retrying a partial one) is a no-op
  // that still finishes the detach + lifecycle re-evaluation.
  if (member.state !== "left") {
    await prisma.circleMember.update({
      where: { id: member.id },
      data: { state: "left", leftAt: new Date() },
    });
  }

  if (member.taskId) {
    await detachTasksFromCircle([member.taskId]);
  }

  await evaluateCircleLifecycle(circleId);

  return { left: true };
}

/* -------------------------------------------------------
   PUSH THEM ALL — one normal push per member task,
   skipping own/already-pushed/blocked/completed.
--------------------------------------------------------- */

export async function pushAllInCircle(userId: string, circleId: string) {
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    include: {
      members: {
        where: { state: "active", userId: { not: userId }, taskId: { not: null } },
        select: { userId: true, taskId: true },
      },
    },
  });

  if (!circle) {
    throw new AppError("Circle not found.", HttpStatus.NOT_FOUND);
  }

  if (circle.status !== "active") {
    throw new AppError("This circle has wrapped up.", HttpStatus.CONFLICT);
  }

  const blockedIds = new Set(await getBlockedUserIdsForViewer(userId));
  const candidates = circle.members.filter(
    (member) => !blockedIds.has(member.userId)
  );
  const candidateTaskIds = candidates.map((member) => member.taskId as string);

  const existingPushes = await prisma.push.findMany({
    where: { userId, taskId: { in: candidateTaskIds } },
    select: { taskId: true },
  });
  const alreadyPushed = new Set(existingPushes.map((push) => push.taskId));

  const pushed: string[] = [];

  for (const member of candidates) {
    const taskId = member.taskId as string;
    if (alreadyPushed.has(taskId)) continue;

    try {
      await togglePushForTask({ userId, taskId });
      pushed.push(taskId);
    } catch (error) {
      // One unpushable lane (completed, hidden, …) must not stop the fan-out.
      if (error instanceof AppError) continue;
      throw error;
    }
  }

  return { pushed };
}

/* -------------------------------------------------------
   DETAIL (optional auth — signed-out viewers see lanes)
--------------------------------------------------------- */

export async function getCircleById(
  circleId: string,
  viewerId?: string | null
): Promise<CircleDetailDTO> {
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    include: {
      createdBy: { select: { name: true, photo: true } },
      members: {
        where: { state: { in: ["active", "done"] } },
        orderBy: { joinedAt: "asc" },
        include: { user: memberUserSelect, task: memberTaskSelect },
      },
    },
  });

  if (!circle) {
    throw new AppError("Circle not found.", HttpStatus.NOT_FOUND);
  }

  const blockedIds = new Set(await getBlockedUserIdsForViewer(viewerId ?? null));
  const visibleMembers = circle.members.filter(
    (member) => !blockedIds.has(member.userId)
  );

  if (circle.members.length > 0 && visibleMembers.length === 0) {
    throw new AppError("Circle not found.", HttpStatus.NOT_FOUND);
  }

  const viewerMember = viewerId
    ? (await getMembershipWithTask(circleId, viewerId)) ?? null
    : null;

  const laneTaskIds = visibleMembers
    .map((member) => member.task?.id)
    .filter((id): id is string => Boolean(id));

  const hasPushedTaskIds = new Set<string>();
  if (viewerId && laneTaskIds.length > 0) {
    const pushes = await prisma.push.findMany({
      where: { userId: viewerId, taskId: { in: laneTaskIds } },
      select: { taskId: true },
    });
    pushes.forEach((push) => hasPushedTaskIds.add(push.taskId));
  }

  const latestUpdateBeatIds = visibleMembers
    .map((member) => member.task?.progressUpdates?.[0]?.beat?.id)
    .filter((id): id is string => Boolean(id));

  const viewerCheeredBeatIds = new Set<string>();
  if (viewerId && latestUpdateBeatIds.length > 0) {
    const cheers = await prisma.cheer.findMany({
      where: { userId: viewerId, beatId: { in: latestUpdateBeatIds } },
      select: { beatId: true },
    });
    cheers.forEach((cheer) => viewerCheeredBeatIds.add(cheer.beatId));
  }

  const viewerNudgedUserIds = new Set<string>();
  if (viewerId) {
    const nudgesToday = await prisma.notification.findMany({
      where: {
        senderId: viewerId,
        type: NOTIFICATION_TYPES.CIRCLE_NUDGE,
        createdAt: { gte: startOfToday() },
        metadata: { path: ["circleId"], equals: circleId },
      },
      select: { userId: true },
    });
    nudgesToday.forEach((nudge) => viewerNudgedUserIds.add(nudge.userId));
  }

  const activity = await buildCircleActivity(circle, visibleMembers, blockedIds);

  return toCircleDetail({
    circle,
    visibleMembers,
    totalMemberCount: circle.members.length,
    viewerMember,
    hasPushedTaskIds,
    viewerCheeredBeatIds,
    viewerNudgedUserIds,
    activity,
  });
}

/* -------------------------------------------------------
   ACTIVITY — the circle's shared timeline. Rendering law:
   positive events only, newest first. Quiet stays quiet.
--------------------------------------------------------- */

const CIRCLE_ACTIVITY_LIMIT = 30;

async function buildCircleActivity(
  circle: {
    id: string;
    createdAt: Date;
    completedAt: Date | null;
    createdById: string | null;
    createdBy: { name: string; photo: string | null } | null;
  },
  visibleMembers: {
    id: string;
    userId: string;
    joinedAt: Date;
    doneAt: Date | null;
    user: { name: string; photo: string | null };
  }[],
  blockedIds: Set<string>
): Promise<CircleActivityEventDTO[]> {
  const events: CircleActivityEventDTO[] = [];
  const memberNameByUserId = new Map(
    visibleMembers.map((member) => [member.userId, member.user.name])
  );

  if (circle.createdBy && circle.createdById && !blockedIds.has(circle.createdById)) {
    events.push({
      id: `created-${circle.id}`,
      kind: "created",
      at: circle.createdAt.toISOString(),
      name: circle.createdBy.name,
      avatar: circle.createdBy.photo ?? "",
    });
  }

  for (const member of visibleMembers) {
    if (member.userId !== circle.createdById) {
      events.push({
        id: `joined-${member.id}`,
        kind: "joined",
        at: member.joinedAt.toISOString(),
        name: member.user.name,
        avatar: member.user.photo ?? "",
      });
    }

    if (member.doneAt) {
      events.push({
        id: `done-${member.id}`,
        kind: "done",
        at: member.doneAt.toISOString(),
        name: member.user.name,
        avatar: member.user.photo ?? "",
      });
    }
  }

  const updates = await prisma.progressUpdate.findMany({
    where: { task: { circleId: circle.id } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      text: true,
      createdAt: true,
      sender: { select: { id: true, name: true, photo: true } },
    },
  });

  for (const update of updates) {
    if (blockedIds.has(update.sender.id)) continue;
    events.push({
      id: `update-${update.id}`,
      kind: "update",
      at: update.createdAt.toISOString(),
      name: update.sender.name,
      avatar: update.sender.photo ?? "",
      text: update.text,
    });
  }

  const pushes = await prisma.push.findMany({
    where: { task: { circleId: circle.id } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, name: true, photo: true } },
      task: { select: { userId: true } },
    },
  });

  for (const push of pushes) {
    if (blockedIds.has(push.user.id)) continue;
    const targetName = memberNameByUserId.get(push.task.userId);
    if (!targetName) continue;
    events.push({
      id: `push-${push.id}`,
      kind: "push",
      at: push.createdAt.toISOString(),
      name: push.user.name,
      avatar: push.user.photo ?? "",
      targetName,
    });
  }

  if (circle.completedAt) {
    events.push({
      id: `complete-${circle.id}`,
      kind: "complete",
      at: circle.completedAt.toISOString(),
      name: "The circle",
      avatar: "",
    });
  }

  return events
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, CIRCLE_ACTIVITY_LIMIT);
}

/* -------------------------------------------------------
   NUDGE — a quiet "thinking of you", softer than a push.
   Once per member per day per nudger.
--------------------------------------------------------- */

export async function nudgeCircleMember(
  nudgerId: string,
  circleId: string,
  targetUserId: string
) {
  if (nudgerId === targetUserId) {
    throw new AppError("You can't nudge yourself.", HttpStatus.BAD_REQUEST);
  }

  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: { status: true, goalText: true },
  });

  if (!circle) {
    throw new AppError("Circle not found.", HttpStatus.NOT_FOUND);
  }

  if (circle.status !== "active") {
    throw new AppError("This circle has wrapped up.", HttpStatus.CONFLICT);
  }

  const targetMember = await getMembershipWithTask(circleId, targetUserId);
  if (!targetMember || targetMember.state !== "active") {
    throw new AppError("They're not in this circle.", HttpStatus.NOT_FOUND);
  }

  const blockedIds = new Set(await getBlockedUserIdsForViewer(nudgerId));
  if (blockedIds.has(targetUserId)) {
    throw new AppError("This member is unavailable.", HttpStatus.FORBIDDEN);
  }

  const alreadyNudgedToday = await prisma.notification.count({
    where: {
      senderId: nudgerId,
      userId: targetUserId,
      type: NOTIFICATION_TYPES.CIRCLE_NUDGE,
      createdAt: { gte: startOfToday() },
      metadata: { path: ["circleId"], equals: circleId },
    },
  });

  if (alreadyNudgedToday > 0) {
    return { nudged: false };
  }

  const nudger = await prisma.user.findUnique({
    where: { id: nudgerId },
    select: { name: true },
  });

  await sendCircleNotifications({
    circleId,
    recipientIds: [targetUserId],
    senderId: nudgerId,
    type: NOTIFICATION_TYPES.CIRCLE_NUDGE,
    message: getCircleNudgeNotificationMessage(),
    push: getCircleNudgePushText(nudger?.name ?? "Someone", circle.goalText),
    metadata: { taskText: circle.goalText },
  });

  return { nudged: true };
}

/* -------------------------------------------------------
   FEED CARDS — one card per circle, first feed page only
--------------------------------------------------------- */

export async function getCircleFeedCards(
  viewerId: string | null,
  blockedUserIds: string[] = []
): Promise<CircleFeedCard[]> {
  // Server-side kill switch: with the flag off the feed simply has no cards,
  // even for clients that ask for them.
  if (!getGlobalFeatureFlags().circles) return [];

  const circles = await prisma.circle.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    // Small-scale by design (max 3 active circles per user); ranking happens
    // in memory on the aggregate latest activity.
    take: 50,
    include: {
      members: {
        where: { state: { in: ["active", "done"] } },
        orderBy: { joinedAt: "asc" },
        include: { user: memberUserSelect, task: memberTaskSelect },
      },
    },
  });

  const blocked = new Set(blockedUserIds);

  return circles
    .map((circle) => toCircleFeedCard(circle, blocked))
    .filter((card): card is CircleFeedCard => card !== null)
    .sort((a, b) => b.latestActivityAt.localeCompare(a.latestActivityAt))
    .slice(0, CIRCLE_FEED_CARD_LIMIT);
}

/* -------------------------------------------------------
   HOOKS from the task lifecycle (complete / delete / update)
--------------------------------------------------------- */

export async function handleCircleTaskCompleted(
  circleId: string,
  userId: string,
  taskId: string
) {
  const member = await getMembershipWithTask(circleId, userId);
  if (!member || member.state !== "active") return;

  await prisma.circleMember.update({
    where: { id: member.id },
    data: { state: "done", doneAt: new Date() },
  });

  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: { goalText: true, status: true },
  });

  if (circle?.status === "active") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const otherMembers = await prisma.circleMember.findMany({
      where: { circleId, state: { in: ["active", "done"] }, userId: { not: userId } },
      select: { userId: true },
    });

    await sendCircleNotifications({
      circleId,
      recipientIds: otherMembers.map((other) => other.userId),
      senderId: userId,
      type: NOTIFICATION_TYPES.CIRCLE_MEMBER_DONE,
      message: getCircleMemberDoneNotificationMessage(),
      push: getCircleMemberDonePushText(user?.name ?? "Someone", circle.goalText),
      bypassCap: true,
      metadata: { taskId, taskText: circle.goalText },
    });
  }

  await evaluateCircleLifecycle(circleId);
}

export async function handleCircleTaskUncompleted(circleId: string, userId: string) {
  // Once a circle has completed, the group moment already happened — an
  // un-complete only reopens the member's lane while the circle is active.
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: { status: true },
  });
  if (!circle || circle.status !== "active") return;

  await prisma.circleMember.updateMany({
    where: { circleId, userId, state: "done" },
    data: { state: "active", doneAt: null },
  });
}

export async function handleCircleTaskDeleted(circleId: string, userId: string) {
  await prisma.circleMember.updateMany({
    where: { circleId, userId, state: { in: ["active", "done"] } },
    data: { state: "left", leftAt: new Date() },
  });

  await evaluateCircleLifecycle(circleId);
}

export async function notifyCircleOfProgressUpdate({
  circleId,
  senderId,
  senderName,
  progressText,
  alreadyNotifiedUserIds,
}: {
  circleId: string;
  senderId: string;
  senderName: string;
  progressText: string;
  alreadyNotifiedUserIds: string[];
}) {
  // Done members only hear about completions from here on (spec §6), and
  // members who already got the pusher/helper notification aren't doubled up.
  const alreadyNotified = new Set(alreadyNotifiedUserIds);
  const members = await prisma.circleMember.findMany({
    where: { circleId, state: "active", userId: { not: senderId } },
    select: { userId: true },
  });

  const recipientIds = members
    .map((member) => member.userId)
    .filter((id) => !alreadyNotified.has(id));

  await sendCircleNotifications({
    circleId,
    recipientIds,
    senderId,
    type: NOTIFICATION_TYPES.CIRCLE_PROGRESS_UPDATE,
    message: getCircleProgressUpdateNotificationMessage(),
    push: getCircleProgressUpdatePushText(senderName, progressText),
    metadata: { taskText: progressText },
  });
}
