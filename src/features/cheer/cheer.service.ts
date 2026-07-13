import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/client";
import { HttpStatus } from "../../types/httpStatus";
import { NOTIFICATION_TYPES } from "../../types/notificationTypes";
import { schedulePush } from "../../utils/scheduleReminderPush";
import { getTaskCheerPushText } from "../../utils/notificationTextCatalog";
import { getActiveCheerPreset } from "./cheer.presets";
import { AvatarUser, BeatCheerState, TaskCheerSummary } from "./cheer.types";
import { isTaskHiddenForViewer } from "../moderation/moderation.service";
import { completeFirstTimeHint } from "../hints/hints.service";

const CHEER_SAMPLE_SIZE = 3;
const CHEER_NOTIFICATION_GROUP_MS = 30 * 60 * 1000;

type PrismaExecutor = Prisma.TransactionClient | typeof prisma;

type CheerNotificationPayload = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

function isKnownPrismaError(
  error: unknown,
  code: string
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function toAvatarUser(user: AvatarUser): AvatarUser {
  return {
    id: user.id,
    name: user.name,
    photo: user.photo ?? null,
  };
}

function compareBeatRecency(
  left: { createdAt: Date; id: string },
  right: { createdAt: Date; id: string }
) {
  const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();
  if (timeDiff !== 0) return timeDiff;
  return left.id.localeCompare(right.id);
}

export async function getTaskCheerSummaryForTask(
  taskId: string,
  callerId?: string | null,
  db: PrismaExecutor = prisma
): Promise<TaskCheerSummary> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      userId: true,
      completed: true,
      beats: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          type: true,
          updateId: true,
          createdAt: true,
          cheers: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              userId: true,
              presetKey: true,
              presetTextSnapshot: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  photo: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!task) {
    return {
      beats: [],
      cheerTotal: 0,
      distinctCheererCount: 0,
      sampleCheerers: [],
      mostCheeredBeatId: null,
    };
  }

  const beats = task.beats;
  const latestBeat = beats.reduce<(typeof beats)[number] | null>((latest, beat) => {
    if (!latest) return beat;
    return compareBeatRecency(beat, latest) > 0 ? beat : latest;
  }, null);

  const cheerCountsByBeat = new Map<string, number>();
  const distinctCheerers = new Map<string, AvatarUser>();
  let cheerTotal = 0;

  for (const beat of beats) {
    const cheers = beat.cheers.filter((cheer) => cheer.userId !== task.userId);
    cheerCountsByBeat.set(beat.id, cheers.length);
    cheerTotal += cheers.length;

    for (const cheer of cheers) {
      if (!distinctCheerers.has(cheer.user.id)) {
        distinctCheerers.set(cheer.user.id, toAvatarUser(cheer.user));
      }
    }
  }

  const mostCheeredBeat = beats.reduce<(typeof beats)[number] | null>(
    (current, beat) => {
      const beatCount = cheerCountsByBeat.get(beat.id) ?? 0;
      if (beatCount === 0) return current;
      if (!current) return beat;

      const currentCount = cheerCountsByBeat.get(current.id) ?? 0;
      if (beatCount > currentCount) return beat;
      if (beatCount < currentCount) return current;

      return compareBeatRecency(beat, current) > 0 ? beat : current;
    },
    null
  );

  const mostCheeredBeatId = mostCheeredBeat?.id ?? null;

  return {
    beats: beats.map((beat) => {
      const cheers = beat.cheers.filter((cheer) => cheer.userId !== task.userId);
      const callerCheer = callerId
        ? cheers.find((cheer) => cheer.userId === callerId)
        : undefined;

      const state: BeatCheerState = {
        beatId: beat.id,
        type: beat.type,
        updateId: beat.updateId,
        createdAt: beat.createdAt.toISOString(),
        isLatest: latestBeat?.id === beat.id,
        isCheeringOpen: !task.completed && latestBeat?.id === beat.id,
        cheerCount: cheers.length,
        sampleCheerers: cheers.slice(0, CHEER_SAMPLE_SIZE).map((cheer) =>
          toAvatarUser(cheer.user)
        ),
        callerHasCheered: Boolean(callerCheer),
        isMostCheered: mostCheeredBeatId === beat.id,
      };

      if (callerCheer) {
        state.callerCheer = {
          presetKey: callerCheer.presetKey,
          presetText: callerCheer.presetTextSnapshot,
          createdAt: callerCheer.createdAt.toISOString(),
        };
      }

      return state;
    }),
    cheerTotal,
    distinctCheererCount: distinctCheerers.size,
    sampleCheerers: [...distinctCheerers.values()].slice(0, CHEER_SAMPLE_SIZE),
    mostCheeredBeatId,
  };
}

async function createOrUpdateCheerNotification(
  tx: Prisma.TransactionClient,
  {
    taskId,
    taskType,
    beatId,
    updateId,
    beatType,
    ownerId,
    cheererId,
  }: {
    taskId: string;
    taskType: string;
    beatId: string;
    updateId: string | null;
    beatType: "post" | "update";
    ownerId: string;
    cheererId: string;
  }
): Promise<CheerNotificationPayload | null> {
  if (ownerId === cheererId) return null;

  const [owner, cheerer] = await Promise.all([
    tx.user.findUnique({
      where: { id: ownerId },
      select: { fcmToken: true },
    }),
    tx.user.findUnique({
      where: { id: cheererId },
      select: { name: true },
    }),
  ]);

  if (!cheerer) return null;

  const cutoff = new Date(Date.now() - CHEER_NOTIFICATION_GROUP_MS);
  const existingNotification = await tx.notification.findFirst({
    where: {
      userId: ownerId,
      type: NOTIFICATION_TYPES.TASK_CHEER,
      createdAt: { gte: cutoff },
      AND: [
        { metadata: { path: ["taskId"], equals: taskId } },
        { metadata: { path: ["beatId"], equals: beatId } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      createdAt: true,
      sender: {
        select: {
          name: true,
        },
      },
    },
  });

  const metadata = {
    taskId,
    beatId,
    updateId,
    notificationType: NOTIFICATION_TYPES.TASK_CHEER,
  };

  let senderName = cheerer.name.trim() || "Someone";
  let otherCount = 0;

  if (existingNotification) {
    senderName =
      existingNotification.sender?.name.trim() ||
      senderName;
    const groupStart = new Date(existingNotification.createdAt.getTime() - 5000);
    const cheerCountInGroup = await tx.cheer.count({
      where: {
        beatId,
        createdAt: { gte: groupStart },
      },
    });
    otherCount = Math.max(1, cheerCountInGroup - 1);
  }

  const { title, body } = getTaskCheerPushText(senderName, beatType, otherCount);

  if (existingNotification) {
    await tx.notification.update({
      where: { id: existingNotification.id },
      data: {
        message: body,
        read: false,
        metadata,
      },
    });

    return null;
  } else {
    await tx.notification.create({
      data: {
        userId: ownerId,
        senderId: cheererId,
        type: NOTIFICATION_TYPES.TASK_CHEER,
        taskType,
        message: body,
        metadata,
      },
    });
  }

  if (!owner?.fcmToken) return null;

  return {
    token: owner.fcmToken,
    title,
    body,
    data: {
      taskId,
      beatId,
      notificationType: NOTIFICATION_TYPES.TASK_CHEER,
      ...(updateId ? { updateId } : {}),
      deeplinkPath: `/tasks/${taskId}`,
      screen: "TaskDetail",
    },
  };
}

export async function cheerBeat({
  beatId,
  userId,
  presetKey,
}: {
  beatId: string;
  userId: string;
  presetKey: string;
}) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const beat = await tx.taskBeat.findUnique({
            where: { id: beatId },
            select: {
              id: true,
              taskId: true,
              type: true,
              updateId: true,
            },
          });

          if (!beat) {
            throw new AppError("Beat not found.", HttpStatus.NOT_FOUND);
          }

          const lockedTasks = await tx.$queryRaw<
            {
              id: string;
              userId: string;
              type: string;
              completed: boolean;
              circleId: string | null;
            }[]
          >`
            SELECT id, "userId", type, completed, "circleId"
            FROM "Task"
            WHERE id = ${beat.taskId}
            FOR UPDATE
          `;
          const task = lockedTasks[0];

          if (!task) {
            throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
          }

          if (task.type !== "motivation") {
            throw new AppError(
              "Cheers are only available for motivation tasks.",
              HttpStatus.BAD_REQUEST
            );
          }

          // Circle wins stay cheerable after the finish: "cheer them on"
          // is the point of a done lane. Solo tasks close as before.
          if (task.completed && !task.circleId) {
            throw new AppError(
              "Completed tasks cannot receive cheers.",
              HttpStatus.CONFLICT
            );
          }

          if (task.userId === userId) {
            throw new AppError(
              "You cannot cheer your own task.",
              HttpStatus.FORBIDDEN
            );
          }

          if (await isTaskHiddenForViewer(task.userId, userId)) {
            throw new AppError("This task is unavailable.", HttpStatus.FORBIDDEN);
          }

          // Circle updates take lightweight reactions from anyone — the
          // push-first gate only applies to solo tasks (spec v2: a cheer
          // that isn't a full push is the point of circle reactions).
          if (!task.circleId) {
            const push = await tx.push.findFirst({
              where: {
                taskId: beat.taskId,
                userId,
              },
              select: { id: true },
            });

            if (!push) {
              throw new AppError(
                "You need to push this task before cheering it.",
                HttpStatus.FORBIDDEN
              );
            }
          }

          const latestBeat = await tx.taskBeat.findFirst({
            where: { taskId: beat.taskId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
          });

          // A finished circle task's post beat is its win beat: the timeline
          // offers "cheer them on" there even when update beats came later.
          const isCircleWinBeat =
            Boolean(task.circleId) && task.completed && beat.type === "post";

          if (latestBeat?.id !== beat.id && !isCircleWinBeat) {
            throw new AppError(
              "Cheering is only open on the latest beat.",
              HttpStatus.CONFLICT
            );
          }

          const preset = getActiveCheerPreset(presetKey);
          if (!preset) {
            throw new AppError("Invalid cheer preset.", HttpStatus.BAD_REQUEST);
          }

          let inserted = false;

          try {
            await tx.cheer.create({
              data: {
                taskId: beat.taskId,
                beatId: beat.id,
                userId,
                presetKey: preset.key,
                presetTextSnapshot: preset.text,
              },
              select: { id: true },
            });
            inserted = true;
          } catch (error) {
            if (!isKnownPrismaError(error, "P2002")) {
              throw error;
            }
          }

          const pushNotification = inserted
            ? await createOrUpdateCheerNotification(tx, {
                taskId: beat.taskId,
                taskType: task.type,
                beatId: beat.id,
                updateId: beat.updateId,
                beatType: beat.type,
                ownerId: task.userId,
                cheererId: userId,
              })
            : null;

          const summary = await getTaskCheerSummaryForTask(beat.taskId, userId, tx);
          const beatState = summary.beats.find((item) => item.beatId === beat.id);

          return {
            response: {
              beat: beatState,
              ...summary,
            },
            pushNotification,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      if (result.pushNotification) {
        schedulePush(
          0,
          result.pushNotification.token,
          result.pushNotification.title,
          result.pushNotification.body,
          result.pushNotification.data
        );
      }

      await completeFirstTimeHint(userId, "cheer_discovery");

      return result.response;
    } catch (error) {
      lastError = error;
      if (!isKnownPrismaError(error, "P2034")) {
        throw error;
      }
    }
  }

  throw lastError;
}
