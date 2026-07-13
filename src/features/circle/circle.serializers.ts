import { CircleMemberState, CircleStatus } from "@prisma/client";
import {
  CircleActivityEventDTO,
  CircleDetailDTO,
  CircleFeedCard,
  CircleInvitePreviewDTO,
  CircleLaneDTO,
  CircleSummaryDTO,
} from "./circle.types";

export const CIRCLE_MAX_MEMBERS = 5;

// Rendering law (spec §8): every circle payload built here carries positive
// events only. No last-active timestamps, no "hasn't posted" derivations —
// if a field would expose inactivity, it doesn't belong in these DTOs.

type MemberUser = { id: string; name: string; photo: string | null };

type MemberTask = {
  id: string;
  feeling: string | null;
  createdAt: Date;
  completed: boolean;
  pushCount: number;
  latestActivityAt: Date;
  progressUpdates?: {
    text: string;
    createdAt: Date;
    beat?: { id: string; _count?: { cheers: number } } | null;
  }[];
};

export type CircleMemberRecord = {
  id: string;
  userId: string;
  state: CircleMemberState;
  joinedAt: Date;
  doneAt: Date | null;
  user: MemberUser;
  task?: MemberTask | null;
};

export type CircleRecord = {
  id: string;
  goalText: string;
  status: CircleStatus;
  createdAt: Date;
  completedAt: Date | null;
};

export function toCircleSummary(circle: CircleRecord): CircleSummaryDTO {
  return {
    id: circle.id,
    goalText: circle.goalText,
    status: circle.status,
    createdAt: circle.createdAt.toISOString(),
  };
}

export function toCircleLane(
  member: CircleMemberRecord,
  hasPushedTaskIds: Set<string>,
  viewerCheeredBeatIds: Set<string> = new Set(),
  viewerNudgedUserIds: Set<string> = new Set()
): CircleLaneDTO {
  const latestUpdate = member.task?.progressUpdates?.[0] ?? null;
  const updateBeatId = latestUpdate?.beat?.id ?? null;

  return {
    memberId: member.id,
    userId: member.userId,
    name: member.user.name,
    avatar: member.user.photo ?? "",
    state: member.state as "active" | "done",
    joinedAt: member.joinedAt.toISOString(),
    doneAt: member.doneAt?.toISOString() ?? null,
    taskId: member.task?.id ?? null,
    taskCreatedAt: member.task?.createdAt.toISOString() ?? null,
    feeling: member.task?.feeling ?? null,
    completed: member.task?.completed ?? member.state === "done",
    pushCount: member.task?.pushCount ?? 0,
    hasPushed: member.task ? hasPushedTaskIds.has(member.task.id) : false,
    viewerHasNudged: viewerNudgedUserIds.has(member.userId),
    latestUpdate: latestUpdate
      ? {
          text: latestUpdate.text,
          createdAt: latestUpdate.createdAt.toISOString(),
          beatId: updateBeatId,
          cheerCount: latestUpdate.beat?._count?.cheers ?? 0,
          viewerHasCheered: updateBeatId ? viewerCheeredBeatIds.has(updateBeatId) : false,
        }
      : null,
  };
}

export function toCircleDetail({
  circle,
  visibleMembers,
  totalMemberCount,
  viewerMember,
  hasPushedTaskIds,
  viewerCheeredBeatIds,
  viewerNudgedUserIds,
  activity,
}: {
  circle: CircleRecord;
  visibleMembers: CircleMemberRecord[];
  totalMemberCount: number;
  viewerMember: { state: CircleMemberState } | null;
  hasPushedTaskIds: Set<string>;
  viewerCheeredBeatIds: Set<string>;
  viewerNudgedUserIds: Set<string>;
  activity: CircleActivityEventDTO[];
}): CircleDetailDTO {
  const lanes = visibleMembers.map((member) =>
    toCircleLane(member, hasPushedTaskIds, viewerCheeredBeatIds, viewerNudgedUserIds)
  );
  const doneCount = lanes.filter((lane) => lane.state === "done").length;

  return {
    id: circle.id,
    goalText: circle.goalText,
    status: circle.status,
    createdAt: circle.createdAt.toISOString(),
    completedAt: circle.completedAt?.toISOString() ?? null,
    memberCount: lanes.length,
    doneCount,
    totalPushes: lanes.reduce((sum, lane) => sum + lane.pushCount, 0),
    hasOpenSeats: totalMemberCount < CIRCLE_MAX_MEMBERS,
    viewer: {
      isMember: Boolean(viewerMember && viewerMember.state !== "left"),
      state: viewerMember?.state ?? null,
    },
    lanes,
    activity,
  };
}

export function toCircleFeedCard(
  circle: CircleRecord & { members: CircleMemberRecord[] },
  blockedUserIds: Set<string>
): CircleFeedCard | null {
  const visible = circle.members.filter((member) => !blockedUserIds.has(member.userId));
  if (visible.length === 0) return null;

  const latestActivityMs = Math.max(
    circle.createdAt.getTime(),
    ...visible.map((member) => member.task?.latestActivityAt.getTime() ?? 0)
  );

  const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const recentUpdateCount = visible.filter((member) => {
    const latestUpdate = member.task?.progressUpdates?.[0];
    return latestUpdate ? latestUpdate.createdAt.getTime() >= dayAgoMs : false;
  }).length;

  return {
    kind: "circle",
    id: circle.id,
    goalText: circle.goalText,
    status: circle.status,
    createdAt: circle.createdAt.toISOString(),
    totalPushes: visible.reduce((sum, member) => sum + (member.task?.pushCount ?? 0), 0),
    latestActivityAt: new Date(latestActivityMs).toISOString(),
    recentUpdateCount,
    members: visible.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      avatar: member.user.photo ?? "",
      state: member.state as "active" | "done",
      taskId: member.task?.id ?? null,
      taskCreatedAt: member.task?.createdAt.toISOString() ?? null,
      feeling: member.task?.feeling ?? null,
      hasUpdate: Boolean(member.task?.progressUpdates?.[0]),
    })),
  };
}

export function toCircleInvitePreview(invite: {
  expiresAt: Date;
  revokedAt: Date | null;
  circle: CircleRecord & { members: CircleMemberRecord[] };
}): CircleInvitePreviewDTO {
  const members = invite.circle.members;
  const expired =
    Boolean(invite.revokedAt) || invite.expiresAt.getTime() < Date.now();

  const state: CircleInvitePreviewDTO["state"] =
    invite.circle.status !== "active"
      ? "closed"
      : expired
        ? "expired"
        : members.length >= CIRCLE_MAX_MEMBERS
          ? "full"
          : "open";

  return {
    goalText: invite.circle.goalText,
    state,
    memberCount: members.length,
    members: members.map((member) => ({
      name: member.user.name,
      avatar: member.user.photo ?? "",
    })),
    expiresAt: invite.expiresAt.toISOString(),
  };
}
