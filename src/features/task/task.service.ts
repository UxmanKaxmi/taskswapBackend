import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/client";
import { Prisma } from "@prisma/client";
import {
  CreateTaskInput,
  ReminderTaskType,
  DecisionTaskType,
  MotivationTaskType,
  TaskType,
  GetAllTasksHelpers,
  FeedSort,
  AdviceTaskType,
  FeelingTag,
} from "./task.types";
import { HttpStatus } from "../../types/httpStatus";
import { schedulePush } from "../../utils/scheduleReminderPush";
import {
  getDecisionFinalizedNotificationText,
  getHelperNotificationText,
  getTaskReminderPushNotificationText,
} from "../../utils/notificationTextCatalog";
import {
  createTaskHelperNotifications,
  createDecisionTaskDoneNotifications,
  createTaskProgressUpdateNotifications,
} from "../notification/notification.service";
import { scheduleSeededPushesForTask } from "../seededPush/seededPush.service";
import { completeFirstTimeHint } from "../hints/hints.service";
import {
  cancelScheduledPushesForTask,
  createScheduledPush,
} from "../notification/scheduledPush.service";
import { anonOwnerId, generateAnonIdentity } from "../../utils/anonIdentity";
import { isMaskedForViewer } from "./task.serializers";
import { getTaskCheerSummaryForTask } from "../cheer/cheer.service";
import { assertPostableContent } from "../../utils/contentModeration";
import {
  getBlockedUserIdsForViewer,
  isTaskHiddenForViewer,
} from "../moderation/moderation.service";
import {
  getCircleFeedCards,
  handleCircleTaskCompleted,
  handleCircleTaskDeleted,
  handleCircleTaskUncompleted,
  notifyCircleOfProgressUpdate,
  type CircleFeedCard,
} from "../circle/circle.service";

type FeedTask = {
  id: string;
  text: string;
  type: TaskType;
  createdAt: Date;
  userId: string;
  remindAt: Date | null;
  options: string[];
  deliverAt: Date | null;
  avatar: string;
  name: string;
  feeling: FeelingTag | null;
  completed: boolean;
  completedAt: Date | null;
  isPublic: boolean;
  isAnonymous: boolean;
  anonAlias: string | null;
  anonAvatarColor: string | null;
  viewCount: number;
  helpers: {
    id: string;
    name: string;
    email: string;
    photo: string | null;
  }[];
  _count: {
    Comment: number;
    ReminderNote: number;
    Vote: number;
    helpers: number;
    Push: number;
  };
  Push?: { id: string }[];
};

type TaskProgressUpdateSummary = {
  text: string;
  createdAt: string;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const PROGRESS_UPDATE_COOLDOWN_MS =
  process.env.NODE_ENV === "production" ? 6 * HOUR_MS : MINUTE_MS;
// Circle updates are a shared surface — one update a day keeps the circle's
// activity meaningful instead of chatty.
const CIRCLE_PROGRESS_UPDATE_COOLDOWN_MS =
  process.env.NODE_ENV === "production" ? DAY_MS : MINUTE_MS;

type TaskPushHistoryItem = {
  createdAt: Date;
  user: {
    id: string;
    name: string;
    photo: string | null;
  };
};

/* -------------------------------------------------------
   INTERNAL UTILS
--------------------------------------------------------- */

function validateDecisionOptions(options?: string[]) {
  if (!options || options.length < 2) {
    throw new AppError(
      "Decision tasks must have at least two options.",
      HttpStatus.BAD_REQUEST
    );
  }

  const normalized = options.map((o) => o.trim().toLowerCase());
  const unique = new Set(normalized);

  if (unique.size !== normalized.length) {
    throw new AppError(
      "Decision options must be unique.",
      HttpStatus.BAD_REQUEST
    );
  }
}

function toProgressUpdateSummary(
  progressUpdate: { text: string; createdAt: Date } | null | undefined
): TaskProgressUpdateSummary | null {
  if (!progressUpdate) return null;

  return {
    text: progressUpdate.text,
    createdAt: progressUpdate.createdAt.toISOString(),
  };
}

function getProgressUpdateCooldownMessage(
  remainingMs: number,
  cooldownMs: number = PROGRESS_UPDATE_COOLDOWN_MS
) {
  if (cooldownMs < HOUR_MS) {
    const remainingMinutes = Math.ceil(remainingMs / MINUTE_MS);
    return `You can only share a progress update every 1 minute. Try again in about ${remainingMinutes} minute${
      remainingMinutes === 1 ? "" : "s"
    }.`;
  }

  if (cooldownMs >= DAY_MS) {
    const remainingHours = Math.ceil(remainingMs / HOUR_MS);
    return `You can share one update a day. Try again in about ${remainingHours} hour${
      remainingHours === 1 ? "" : "s"
    }.`;
  }

  const remainingHours = Math.ceil(remainingMs / HOUR_MS);
  return `You can only share a progress update every 6 hours. Try again in about ${remainingHours} hour${
    remainingHours === 1 ? "" : "s"
  }.`;
}



async function checkDuplicateTask(text: string, userId: string, excludeId?: string) {
  // Circle tasks are exempt from text uniqueness (every member carries the
  // shared sentence), mirroring the partial unique index.
  return prisma.task.findFirst({
    where: {
      text,
      userId,
      circleId: null,
      NOT: excludeId ? { id: excludeId } : undefined,
    },
  });
}


function hasHelpers(
  input: CreateTaskInput
): input is ReminderTaskType | AdviceTaskType | MotivationTaskType | DecisionTaskType {
  return "helpers" in input && Array.isArray(input.helpers);
}

async function transformTasksForFeed(tasks: FeedTask[], userId?: string | null) {
  const taskIds = tasks.map((t) => t.id);
  const viewerId = userId ?? null;

  if (taskIds.length === 0) {
    return [];
  }

  const remindedTaskIds = new Set<string>();

  if (viewerId) {
    const reminders = await prisma.reminderNote.findMany({
      where: { senderId: viewerId, taskId: { in: taskIds } },
      select: { taskId: true },
    });

    reminders.forEach((r) => remindedTaskIds.add(r.taskId));
  }

  const advisedTaskIds = new Set<string>();

  if (viewerId) {
    const adviceComments = await prisma.comment.findMany({
      where: {
        userId: viewerId,
        taskId: { in: taskIds },
        task: { type: "advice" },
      },
      select: { taskId: true },
    });

    adviceComments.forEach((c) => advisedTaskIds.add(c.taskId));
  }

  const allVotes = await prisma.vote.findMany({
    where: { taskId: { in: taskIds } },
    select: {
      taskId: true,
      option: true,
      user: { select: { id: true, name: true, photo: true } },
    },
  });

  const voteMap: Record<
    string,
    Record<
      string,
      { count: number; voters: { id: string; name: string; photo?: string }[] }
    >
  > = {};

  for (const { taskId, option, user } of allVotes) {
    if (!voteMap[taskId]) voteMap[taskId] = {};
    if (!voteMap[taskId][option]) voteMap[taskId][option] = { count: 0, voters: [] };
    voteMap[taskId][option].count++;
    voteMap[taskId][option].voters.push({ ...user, photo: user.photo ?? undefined });
  }

  const userVoteMap: Record<string, string> = {};

  if (viewerId) {
    const userVotes = await prisma.vote.findMany({
      where: { userId: viewerId, taskId: { in: taskIds } },
      select: { taskId: true, option: true },
    });

    userVotes.forEach(({ taskId, option }) => {
      userVoteMap[taskId] = option;
    });
  }

  return tasks.map((task) => {
    const { _count, anonAlias, anonAvatarColor, ...cleanTask } = task;
    const taskVotes = voteMap[task.id] || {};

    const transformedVotes = Object.fromEntries(
      Object.entries(taskVotes).map(([opt, v]) => [
        opt,
        { count: v.count, preview: v.voters.slice(0, 4) },
      ])
    );

    // Anonymous tasks: replace the owner's identity with the task's alias for
    // everyone but the owner. The fake id never resolves to a profile.
    const masked = isMaskedForViewer(task, viewerId);

    return {
      ...cleanTask,
      userId: masked ? anonOwnerId(task.id) : task.userId,
      name: masked ? anonAlias ?? "Anonymous" : task.name,
      avatar: masked ? "" : task.avatar,
      ...(masked && anonAvatarColor ? { avatarColor: anonAvatarColor } : {}),
      commentsCount: task._count.Comment,
      reminderNoteCount: task._count.ReminderNote,
      voteCount: task._count.Vote,
      helpersCount: task._count.helpers,
      pushCount: task.type === "motivation" ? task._count.Push : 0,
      hasPushed:
        viewerId && task.type === "motivation" ? (task.Push?.length ?? 0) > 0 : false,
      hasAdvised:
        viewerId && task.type === "advice" ? advisedTaskIds.has(task.id) : false,
      hasReminded: viewerId ? remindedTaskIds.has(task.id) : false,
      votes: transformedVotes,
      votedOption: viewerId ? userVoteMap[task.id] ?? null : null,
      hasVoted: viewerId ? Boolean(userVoteMap[task.id]) : false,
    };
  });
}

type TaskFeedResponse = Awaited<ReturnType<typeof transformTasksForFeed>>;

type PaginatedTaskResult = {
  tasks: TaskFeedResponse;
  nextCursor: string | null;
  hasMore: boolean;
  circles?: CircleFeedCard[];
};

const FEED_SORTS = new Set<FeedSort>(["all", "needs_push", "new", "almost_there"]);

type FeedCursorRow = {
  id: string;
  created_at: Date;
  push_count: number;
  latest_activity_at: Date;
};

function normalizeFeedSort(sort?: string): FeedSort {
  return sort && FEED_SORTS.has(sort as FeedSort) ? (sort as FeedSort) : "needs_push";
}

function getFeedCursorCondition(sort: FeedSort, cursor?: FeedCursorRow | null) {
  if (!cursor) return Prisma.empty;

  switch (sort) {
    case "all":
    case "new":
      return Prisma.sql`
        AND (
          t."createdAt" < ${cursor.created_at}
          OR (t."createdAt" = ${cursor.created_at} AND t.id < ${cursor.id})
        )
      `;
    case "almost_there":
      return Prisma.sql`
        AND (
          t."latestActivityAt" < ${cursor.latest_activity_at}
          OR (t."latestActivityAt" = ${cursor.latest_activity_at} AND t.id < ${cursor.id})
        )
      `;
    case "needs_push":
    default:
      return Prisma.sql`
        AND (
          t."pushCount" > ${cursor.push_count}
          OR (t."pushCount" = ${cursor.push_count} AND t."createdAt" < ${cursor.created_at})
          OR (
            t."pushCount" = ${cursor.push_count}
            AND t."createdAt" = ${cursor.created_at}
            AND t.id < ${cursor.id}
          )
        )
      `;
  }
}

function getFeedOrderBy(sort: FeedSort) {
  switch (sort) {
    case "all":
    case "new":
      return Prisma.sql`t."createdAt" DESC, t.id DESC`;
    case "almost_there":
      return Prisma.sql`t."latestActivityAt" DESC, t.id DESC`;
    case "needs_push":
    default:
      return Prisma.sql`t."pushCount" ASC, t."createdAt" DESC, t.id DESC`;
  }
}

async function getFeedCursorRow(
  cursorId: string | undefined,
  excludeUserId?: string | null,
  blockedUserIds: string[] = []
): Promise<FeedCursorRow | null> {
  if (!cursorId) return null;

  const excludeSelfCondition = excludeUserId
    ? Prisma.sql`AND t."userId" <> ${excludeUserId}`
    : Prisma.empty;
  const blockedUsersCondition =
    blockedUserIds.length > 0
      ? Prisma.sql`AND t."userId" NOT IN (${Prisma.join(blockedUserIds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<FeedCursorRow[]>`
    SELECT
      t.id,
      t."createdAt" AS created_at,
      t."pushCount" AS push_count,
      t."latestActivityAt" AS latest_activity_at
    FROM "Task" t
    WHERE
      t.id = ${cursorId}
      AND t."isPublic" = true
      AND t.type = 'motivation'
      AND t.completed = false
      AND t."completedAt" IS NULL
      AND t."circleId" IS NULL
      ${excludeSelfCondition}
      ${blockedUsersCondition}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getOrderedFeedTaskIds({
  sort,
  limit,
  cursorId,
  excludeUserId,
  blockedUserIds,
}: {
  sort: FeedSort;
  limit: number;
  cursorId?: string;
  excludeUserId?: string | null;
  blockedUserIds?: string[];
}) {
  const excludeSelfCondition = excludeUserId
    ? Prisma.sql`AND t."userId" <> ${excludeUserId}`
    : Prisma.empty;
  const almostThereCondition =
    sort === "almost_there" ? Prisma.sql`AND t."isAlmostThere" = true` : Prisma.empty;
  const blockedUsersCondition =
    blockedUserIds && blockedUserIds.length > 0
      ? Prisma.sql`AND t."userId" NOT IN (${Prisma.join(blockedUserIds)})`
      : Prisma.empty;
  const cursor = await getFeedCursorRow(cursorId, excludeUserId, blockedUserIds);
  const cursorCondition = getFeedCursorCondition(sort, cursor);
  const orderBy = getFeedOrderBy(sort);

  // Circle member tasks never appear as individual feed cards — the feed
  // renders ONE circle card per circle instead (see getCircleFeedCards).
  return prisma.$queryRaw<{ id: string }[]>`
    SELECT t.id
    FROM "Task" t
    WHERE
      t."isPublic" = true
      AND t.type = 'motivation'
      AND t.completed = false
      AND t."completedAt" IS NULL
      AND t."circleId" IS NULL
      ${almostThereCondition}
      ${excludeSelfCondition}
      ${blockedUsersCondition}
      ${cursorCondition}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;
}

/* -------------------------------------------------------
   CREATE TASK (auth required)
--------------------------------------------------------- */

export async function createTask(input: CreateTaskInput) {
  const { text, userId, type } = input;

  assertPostableContent([
    text,
    ...(type === "decision" ? input.options ?? [] : []),
  ]);

  const existing = await checkDuplicateTask(text, userId);
  if (existing) {
    throw new AppError("You already created this task.", HttpStatus.CONFLICT);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, photo: true, fcmToken: true },
  });

  if (!user) {
    throw new AppError("User not found.", HttpStatus.FORBIDDEN);
  }

  const avatar = input.avatar ?? user.photo ?? undefined;
  const name = user.name;

  const isAnonymous = input.isAnonymous === true;
  let anonIdentity: { alias: string; avatarColor: string } | null = null;

  if (isAnonymous) {
    if (hasHelpers(input) && input.helpers?.length) {
      throw new AppError(
        "Anonymous goals can't tag friends.",
        HttpStatus.BAD_REQUEST
      );
    }

    const activeAnon = await prisma.task.findFirst({
      where: { userId, isAnonymous: true, completed: false },
      select: { id: true },
    });

    if (activeAnon) {
      throw new AppError(
        "You already have an active anonymous goal. Complete it before starting another.",
        HttpStatus.CONFLICT
      );
    }

    anonIdentity = generateAnonIdentity();
  }

  const remindAt = type === "reminder" ? (input as ReminderTaskType).remindAt : undefined;
  
  if (type === "decision") {
  validateDecisionOptions(input.options);
}

const options =
  type === "decision"
    ? input.options?.map((o) => o.trim()) ?? []
    : [];
    
  const deliverAt = type === "motivation" ? (input as MotivationTaskType).deliverAt ?? undefined : undefined;

  const helpers =
    hasHelpers(input) && input.helpers?.length
      ? { connect: input.helpers.map((id) => ({ id })) }
      : undefined;

  let createdTask;
  try {
    createdTask = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        text,
        type,
        userId,
        isPublic: true,
        avatar,
        name,
        isAnonymous,
        anonAlias: anonIdentity?.alias,
        anonAvatarColor: anonIdentity?.avatarColor,
        feeling: input.feeling ?? null,
        remindAt,
        options,
        deliverAt,
        helpers,
      },
      include: { helpers: true },
    });

    await tx.taskBeat.create({
      data: {
        taskId: task.id,
        type: "post",
        createdAt: task.createdAt,
      },
    });

    return task;
  });
  } catch (error) {
    // Partial unique index: one ACTIVE anonymous task per user. Concurrent
    // creates race past the pre-check; the index is the real guarantee.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      isAnonymous
    ) {
      throw new AppError(
        "You already have an active anonymous goal. Complete it before starting another.",
        HttpStatus.CONFLICT
      );
    }
    throw error;
  }

  await completeFirstTimeHint(userId, "first_goal_posted");

  /* ---------------------------
     Schedule reminder push
  ----------------------------- */
  if (type === "reminder" && remindAt) {
    const deliverAt = new Date(remindAt);
    if (deliverAt.getTime() > Date.now()) {
      const { title, body } = getTaskReminderPushNotificationText(text);
      await createScheduledPush({
        userId,
        taskId: createdTask.id,
        deliverAt,
        title,
        body,
        data: {
          notificationType: "reminder",
          taskId: createdTask.id,
          taskType: "reminder",
          deeplinkPath: `/tasks/${createdTask.id}`,
          screen: "TaskDetail",
        },
      });
    }
  }

  /* ---------------------------
     Notify helpers immediately
  ----------------------------- */
  if (hasHelpers(input) && input.helpers?.length) {
    const helperUsers = await prisma.user.findMany({
      where: { id: { in: input.helpers } },
      select: { id: true, fcmToken: true },
    });
    const helperNotificationText = getHelperNotificationText(type, text);

    await Promise.all(
      helperUsers.map((helper) =>
        helper.fcmToken
          ? schedulePush(
              0,
              helper.fcmToken,
              helperNotificationText.title,
              helperNotificationText.body,
              {
                notificationType: "task-helper",
                taskId: createdTask.id,
                taskType: type,
                deeplinkPath: `/tasks/${createdTask.id}`,
                screen: "TaskDetail",
              }
            )
          : undefined
      )
    );

    await createTaskHelperNotifications({
      helperIds: input.helpers,
      senderId: userId,
      taskId: createdTask.id,
      taskText: text,
    });
  }

  /* ---------------------------
     Schedule seeded launch pushes
  ----------------------------- */
  await scheduleSeededPushesForTask(createdTask.id);

  return createdTask;
}

/* -------------------------------------------------------
   UPDATE TASK
--------------------------------------------------------- */

export async function updateTask(
  id: string,
  data: Partial<CreateTaskInput>,
  userId: string
) {
  const currentTask = await prisma.task.findUnique({
    where: { id },
    select: { userId: true, type: true, isAnonymous: true },
  });

  if (!currentTask) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (currentTask.userId !== userId) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);
  }

  // Anonymity is a one-way door: named→anon is never allowed (the goal has
  // already been seen with a name), and anon→named only happens through the
  // explicit reveal endpoint.
  if (
    data.isAnonymous !== undefined &&
    data.isAnonymous !== currentTask.isAnonymous
  ) {
    throw new AppError(
      "Anonymity can't be changed here. Anonymous goals can be revealed from the goal screen.",
      HttpStatus.BAD_REQUEST
    );
  }

  if (currentTask.isAnonymous && "helpers" in data && data.helpers?.length) {
    throw new AppError(
      "Anonymous goals can't tag friends.",
      HttpStatus.BAD_REQUEST
    );
  }

  if (data.text || "options" in data) {
    assertPostableContent([
      data.text,
      ...("options" in data ? data.options ?? [] : []),
    ]);
  }

  if (data.text) {
    const duplicate = await checkDuplicateTask(data.text, currentTask.userId, id);
    if (duplicate) {
      throw new AppError("Duplicate task text.", HttpStatus.CONFLICT);
    }
  }

  const isHelperType = ["reminder", "motivation", "advice", "decision"].includes(currentTask.type);


  if (
  (data.type === "decision" || currentTask.type === "decision") &&
  "options" in data
) {
  validateDecisionOptions(data.options);
}

  const dataToUpdate: any = {
    text: data.text,
    name: data.name,
    type: data.type,
    feeling: data.feeling,
    remindAt: data.type === "reminder" ? data.remindAt : undefined,
    options:
  data.type === "decision"
    ? data.options?.map((o) => o.trim()) ?? []
    : [],
    deliverAt: data.type === "motivation" ? data.deliverAt : undefined,
    avatar: data.avatar,
    ...(isHelperType && "helpers" in data
      ? { helpers: { set: data.helpers?.map((id) => ({ id })) ?? [] } }
      : {}),
  };

  const updatedTask = await prisma.task.update({
    where: { id },
    data: dataToUpdate,
    include: { helpers: true },
  });

  // Reschedule the reminder push when the reminder time or type changes.
  const reminderAffected = "remindAt" in data || "type" in data || "text" in data;
  if (reminderAffected) {
    await cancelScheduledPushesForTask(id);

    if (
      updatedTask.type === "reminder" &&
      updatedTask.remindAt &&
      updatedTask.remindAt.getTime() > Date.now()
    ) {
      const { title, body } = getTaskReminderPushNotificationText(updatedTask.text);
      await createScheduledPush({
        userId: updatedTask.userId,
        taskId: id,
        deliverAt: updatedTask.remindAt,
        title,
        body,
        data: {
          notificationType: "reminder",
          taskId: id,
          taskType: "reminder",
          deeplinkPath: `/tasks/${id}`,
          screen: "TaskDetail",
        },
      });
    }
  }

  return updatedTask;
}

/* -------------------------------------------------------
   GET SINGLE TASK (optional auth)
--------------------------------------------------------- */

export async function getTaskById(taskId: string, userId?: string | null) {
  // ---------------------------------
  // Fetch task with relations
  // ---------------------------------
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      helpers: { select: { id: true, name: true, photo: true } },
      progressUpdates: {
        orderBy: { createdAt: "desc" },
        select: {
          text: true,
          createdAt: true,
        },
      },
      Vote: {
        include: {
          user: { select: { id: true, name: true, photo: true } },
        },
      },
      _count: { select: { Push: true } },
      Push: userId
        ? {
            orderBy: { createdAt: "desc" },
            select: {
              createdAt: true,
              user: {
                select: { id: true, name: true, photo: true },
              },
            },
          }
        : false,
    },
  });

  if (!task || !task.isPublic) {
    throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  }

  if (await isTaskHiddenForViewer(task.userId, userId)) {
    throw new AppError("This task is hidden.", HttpStatus.NOT_FOUND);
  }

  // ---------------------------------
  // 🔥 Increment view count (non-blocking)
  // ---------------------------------
  prisma.task.update({
    where: { id: taskId },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {}); // prevent any crash from slowing down response

  // ---------------------------------
  // Voting logic
  // ---------------------------------
  const votes = task.Vote.reduce((acc, v) => {
    if (!acc[v.option]) acc[v.option] = { count: 0, preview: [] };
    acc[v.option].count += 1;
    if (acc[v.option].preview.length < 3) {
      acc[v.option].preview.push({
        id: v.user.id,
        name: v.user.name,
        photo: v.user.photo ?? "",
      });
    }
    return acc;
  }, {} as Record<string, { count: number; preview: { id: string; name: string; photo: string }[] }>);

  const votedOption = userId
    ? task.Vote.find((v) => v.userId === userId)?.option ?? null
    : null;

  const hasVoted = userId ? votedOption !== null : false;
  const { Vote, progressUpdates, Push, anonAlias, anonAvatarColor, ...taskData } = task;
  const maskedForViewer = isMaskedForViewer(task, userId);
  const progressUpdateHistory = progressUpdates
    .map((entry) => toProgressUpdateSummary(entry))
    .filter((entry): entry is TaskProgressUpdateSummary => entry !== null);

  // ---------------------------------
  // Include viewCount in response
  // ---------------------------------

  let hasAdvised = false;

  if (userId && task.type === "advice") {
    const advice = await prisma.comment.findFirst({
      where: {
        taskId,
        userId,
      },
      select: { id: true },
    });

    hasAdvised = !!advice;
  }

  let hasReminded = false;

  if (userId) {
    const reminder = await prisma.reminderNote.findFirst({
      where: {
        taskId,
        senderId: userId,
      },
      select: { id: true },
    });

    hasReminded = !!reminder;
  }

  const pushItems = Array.isArray(Push)
    ? (Push as unknown as TaskPushHistoryItem[])
    : [];
  const visiblePushItems = pushItems.filter((p) => p.user.id !== task.userId);
  const pushCount =
    task.type === "motivation"
      ? await prisma.push.count({
          where: {
            taskId,
            userId: { not: task.userId },
          },
        })
      : 0;

  const pushHistory =
    task.type === "motivation"
      ? visiblePushItems.map((p) => ({
          user: p.user,
          pushedAt: p.createdAt,
        }))
      : [];
  const cheerSummary =
    task.type === "motivation"
      ? await getTaskCheerSummaryForTask(taskId, userId)
      : {
          beats: [],
          cheerTotal: 0,
          distinctCheererCount: 0,
          sampleCheerers: [],
          mostCheeredBeatId: null,
        };

  return {
    ...taskData,
    userId: maskedForViewer ? anonOwnerId(task.id) : task.userId,
    name: maskedForViewer ? anonAlias ?? "Anonymous" : task.name,
    avatar: maskedForViewer ? "" : task.avatar,
    ...(maskedForViewer && anonAvatarColor ? { avatarColor: anonAvatarColor } : {}),
    votes,
    votedOption,
    viewCount: task.viewCount,
    hasVoted,
    pushCount,
    hasPushed:
      userId && task.type === "motivation"
        ? visiblePushItems.some((p) => p.user.id === userId)
        : false,
    pushHistory,
    beats: cheerSummary.beats,
    cheerTotal: cheerSummary.cheerTotal,
    distinctCheererCount: cheerSummary.distinctCheererCount,
    sampleCheerers: cheerSummary.sampleCheerers,
    mostCheeredBeatId: cheerSummary.mostCheeredBeatId,
    hasAdvised,
    hasReminded,
    progressUpdates: progressUpdateHistory,
  };
}

/* -------------------------------------------------------
   GET ALL TASKS (optional auth → public feed)
--------------------------------------------------------- */

export async function getAllTasks(
  userId?: string | null,
  helpers?: GetAllTasksHelpers
): Promise<PaginatedTaskResult> {
  const requestedLimit = helpers?.limit ?? 20;
  const normalizedLimit = Math.max(1, Math.min(requestedLimit, 50));
  const fetchLimit = normalizedLimit + 1;
  const sort = normalizeFeedSort(helpers?.sort);
  const cursorId = helpers?.cursor?.trim();
  const excludeUserId = helpers?.excludeSelf && userId ? userId : null;
  const blockedUserIds = await getBlockedUserIdsForViewer(userId ?? null);
  const orderedIds = await getOrderedFeedTaskIds({
    sort,
    limit: fetchLimit,
    cursorId,
    excludeUserId,
    blockedUserIds,
  });

  // Circle cards ride the first page only — they are few (max 3 active per
  // user) and ranked among themselves, so they don't join the task keyset.
  const circles =
    helpers?.includeCircles && !cursorId
      ? await getCircleFeedCards(userId ?? null, blockedUserIds)
      : undefined;

  const hasMore = orderedIds.length === fetchLimit;
  const trimmedIds = hasMore ? orderedIds.slice(0, normalizedLimit) : orderedIds;
  const taskIds = trimmedIds.map((row) => row.id);
  const lastTaskId = taskIds[taskIds.length - 1] ?? null;

  if (taskIds.length === 0) {
    return {
      tasks: [],
      hasMore: false,
      nextCursor: null,
      ...(circles ? { circles } : {}),
    };
  }

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      helpers: { select: { id: true, name: true, email: true, photo: true } },
      _count: {
        select: {
          Comment: true,
          ReminderNote: true,
          Vote: true,
          helpers: true,
          Push: true,
        },
      },
      Push: userId
        ? {
            where: { userId },
            select: { id: true },
          }
        : false,
    },
  });

  const taskOrder = new Map(taskIds.map((id, index) => [id, index]));
  const sortedTasks = tasks.sort((a, b) => {
    return (taskOrder.get(a.id) ?? 0) - (taskOrder.get(b.id) ?? 0);
  });
  const paginatedTasks = await transformTasksForFeed(sortedTasks as FeedTask[], userId);

  return {
    tasks: paginatedTasks,
    hasMore,
    nextCursor: hasMore ? lastTaskId : null,
    ...(circles ? { circles } : {}),
  };
}

export async function getRecentTasksForUserProfile(
  targetUserId: string,
  currentUserId?: string | null,
  limit = 5
) {
  if (await isTaskHiddenForViewer(targetUserId, currentUserId)) {
    return [];
  }

  const recentTasks = await prisma.task.findMany({
    where: {
      userId: targetUserId,
      // Anonymous goals never appear on a profile — only the owner sees them.
      ...(currentUserId === targetUserId ? {} : { isAnonymous: false }),
    },
    include: {
      helpers: { select: { id: true, name: true, email: true, photo: true } },
      _count: { select: { Comment: true, ReminderNote: true, Vote: true, helpers: true, Push: true } },
      Push: currentUserId
        ? {
            where: { userId: currentUserId },
            select: { id: true },
          }
        : false,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return transformTasksForFeed(recentTasks as FeedTask[], currentUserId);
}
/* -------------------------------------------------------
   REVEAL ANONYMOUS TASK (one-way: anon → named)
--------------------------------------------------------- */

export async function revealTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { userId: true, isAnonymous: true },
  });

  if (!task) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (task.userId !== userId) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);
  }

  if (!task.isAnonymous) {
    throw new AppError("This goal is already posted with your name.", HttpStatus.BAD_REQUEST);
  }

  // anonAlias is kept on the row for history/moderation; it simply stops
  // being used once isAnonymous is false.
  return prisma.task.update({
    where: { id: taskId },
    data: { isAnonymous: false },
    include: { helpers: true },
  });
}

/* -------------------------------------------------------
   DELETE TASK
--------------------------------------------------------- */

export async function deleteTask(id: string, userId: string) {
  const existing = await prisma.task.findUnique({ where: { id } });

  if (!existing) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (existing.userId !== userId) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);
  }

  await prisma.vote.deleteMany({ where: { taskId: id } });
  await cancelScheduledPushesForTask(id);

  const deleted = await prisma.task.delete({ where: { id } });

  // Deleting a circle task is a silent leave; the circle may dissolve.
  if (existing.circleId) {
    await handleCircleTaskDeleted(existing.circleId, userId);
  }

  return deleted;
}

/* -------------------------------------------------------
   COMPLETE / UNCOMPLETE TASK
--------------------------------------------------------- */

export async function markTaskAsDone(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { helpers: { select: { id: true } } },
  });

  if (!task) throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  if (task.userId !== userId)
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);

  if (task.type === "decision" && task.helpers.length > 0) {
    const helperIds = task.helpers.map((h) => h.id);

    const helpers = await prisma.user.findMany({
      where: { id: { in: helperIds } },
      select: { fcmToken: true },
    });
    const decisionFinalizedNotificationText = getDecisionFinalizedNotificationText();

    await Promise.all(
      helpers.map((h) =>
        h.fcmToken
          ? schedulePush(
              0,
              h.fcmToken,
              decisionFinalizedNotificationText.title,
              decisionFinalizedNotificationText.body,
              {
                notificationType: "decision-done",
                taskId: task.id,
                taskType: "decision",
                deeplinkPath: `/tasks/${task.id}`,
                screen: "TaskDetail",
              }
            )
          : undefined
      )
    );

    await createDecisionTaskDoneNotifications({
      helperIds,
      senderId: userId,
      taskId: task.id,
      taskText: task.text,
    });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { completed: true, completedAt: new Date() },
  });

  if (updated.circleId) {
    await handleCircleTaskCompleted(updated.circleId, userId, updated.id);
  }

  return updated;
}

export async function markTaskAsNotDone(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task) throw new AppError("Task not found", HttpStatus.NOT_FOUND);
  if (task.userId !== userId)
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED);

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { completed: false, completedAt: null },
  });

  if (updated.circleId) {
    await handleCircleTaskUncompleted(updated.circleId, userId);
  }

  return updated;
}

export async function shareTaskProgress(
  taskId: string,
  senderId: string,
  text: string
): Promise<TaskProgressUpdateSummary> {
  assertPostableContent([text]);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      userId: true,
      type: true,
      text: true,
      name: true,
      isAnonymous: true,
      anonAlias: true,
      completed: true,
      circleId: true,
      Push: {
        select: { userId: true },
      },
      helpers: {
        select: { id: true },
      },
      progressUpdates: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
        },
      },
    },
  });

  if (!task) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (task.type !== "motivation") {
    throw new AppError(
      "Progress updates are only available for motivation tasks.",
      HttpStatus.BAD_REQUEST
    );
  }

  if (task.completed) {
    throw new AppError(
      "Completed tasks cannot receive progress updates.",
      HttpStatus.CONFLICT
    );
  }

  if (task.userId !== senderId) {
    throw new AppError(
      "You can only share progress on your own task.",
      HttpStatus.FORBIDDEN
    );
  }

  const cooldownMs = task.circleId
    ? CIRCLE_PROGRESS_UPDATE_COOLDOWN_MS
    : PROGRESS_UPDATE_COOLDOWN_MS;
  const latestProgressUpdate = task.progressUpdates[0];
  if (latestProgressUpdate) {
    const elapsedMs = Date.now() - latestProgressUpdate.createdAt.getTime();
    if (elapsedMs < cooldownMs) {
      const remainingMs = cooldownMs - elapsedMs;
      const nextAllowedAt = new Date(Date.now() + remainingMs).toISOString();
      throw new AppError(
        getProgressUpdateCooldownMessage(remainingMs, cooldownMs),
        HttpStatus.TOO_MANY_REQUESTS,
        true,
        { nextAllowedAt, remainingMs }
      );
    }
  }

  // Outbound notifications about an anonymous goal always use the alias —
  // supporters must never see the owner's real name.
  const senderName = task.isAnonymous
    ? task.anonAlias ?? "Anonymous"
    : task.name.trim() || "Someone";
  const recipientIds = [
    ...new Set([
      ...task.Push.map((push) => push.userId),
      ...task.helpers.map((helper) => helper.id),
    ]),
  ].filter((recipientId) => recipientId !== senderId);

  const progressUpdate = await prisma.$transaction(async (tx) => {
    const update = await tx.progressUpdate.create({
      data: {
        taskId,
        senderId,
        text,
      },
    });

    await tx.taskBeat.create({
      data: {
        taskId,
        type: "update",
        updateId: update.id,
        createdAt: update.createdAt,
      },
    });

    await tx.task.update({
      where: { id: taskId },
      data: { latestActivityAt: update.createdAt },
    });

    return update;
  });

  await completeFirstTimeHint(senderId, "first_response");

  await createTaskProgressUpdateNotifications({
    recipientIds,
    senderId,
    taskId,
    progressUpdateId: progressUpdate.id,
    taskText: task.text,
    progressText: text,
    taskType: task.type,
    senderName,
  });

  if (task.circleId) {
    await notifyCircleOfProgressUpdate({
      circleId: task.circleId,
      senderId,
      senderName,
      progressText: text,
      alreadyNotifiedUserIds: recipientIds,
    });
  }

  return toProgressUpdateSummary(progressUpdate)!;
}


export async function getTaskViewCount(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { viewCount: true, isPublic: true },
  });

  if (!task || !task.isPublic) {
    return null;
  }

  return task.viewCount;
}

export async function increaseTaskViewCount(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, isPublic: true },
  });

  if (!task || !task.isPublic) {
    return false;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}
