import { CircleMemberState, CircleStatus } from "@prisma/client";

// Circle payloads render POSITIVE events only: no last-active timestamps, no
// inactivity state. Silence is visible by absence; the answer to it is Push.

export type CircleLaneUpdateDTO = {
  text: string;
  createdAt: string;
  // Reactions ride the update's beat via the existing cheer machinery.
  beatId: string | null;
  cheerCount: number;
  viewerHasCheered: boolean;
};

export type CircleLaneDTO = {
  memberId: string;
  userId: string;
  name: string;
  avatar: string;
  state: Extract<CircleMemberState, "active" | "done">;
  joinedAt: string;
  doneAt: string | null;
  taskId: string | null;
  taskCreatedAt: string | null;
  feeling: string | null;
  completed: boolean;
  pushCount: number;
  hasPushed: boolean;
  viewerHasNudged: boolean;
  latestUpdate: CircleLaneUpdateDTO | null;
};

// The circle's shared activity feed: positive events only, newest first.
export type CircleActivityEventDTO = {
  id: string;
  kind: "created" | "joined" | "update" | "push" | "done" | "complete";
  at: string;
  name: string;
  avatar: string;
  // Actor id so the client can render "You" and gate cheer affordances.
  userId?: string;
  text?: string;
  targetName?: string;
  // Cheerable events ride the existing cheer machinery: updates carry their
  // update beat, done wins carry the task's post beat. Absent otherwise.
  beatId?: string;
  cheerCount?: number;
  viewerHasCheered?: boolean;
  latestCheer?: { name: string; text: string } | null;
};

export type CircleDetailDTO = {
  id: string;
  goalText: string;
  status: CircleStatus;
  createdAt: string;
  completedAt: string | null;
  memberCount: number;
  doneCount: number;
  totalPushes: number;
  hasOpenSeats: boolean;
  viewer: {
    isMember: boolean;
    state: CircleMemberState | null;
  };
  lanes: CircleLaneDTO[];
  activity: CircleActivityEventDTO[];
};

export type CircleFeedCard = {
  kind: "circle";
  id: string;
  goalText: string;
  status: CircleStatus;
  createdAt: string;
  totalPushes: number;
  latestActivityAt: string;
  // Members with updates in the last 24h — the card's activity signal.
  recentUpdateCount: number;
  members: {
    userId: string;
    name: string;
    avatar: string;
    state: Extract<CircleMemberState, "active" | "done">;
    taskId: string | null;
    taskCreatedAt: string | null;
    feeling: string | null;
    hasUpdate: boolean;
  }[];
};

export type CircleInvitePreviewDTO = {
  goalText: string;
  state: "open" | "expired" | "full" | "closed";
  memberCount: number;
  members: { name: string; avatar: string }[];
  expiresAt: string;
};

export type CircleSummaryDTO = {
  id: string;
  goalText: string;
  status: CircleStatus;
  createdAt: string;
};
