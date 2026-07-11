"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.getTaskById = getTaskById;
exports.getAllTasks = getAllTasks;
exports.getRecentTasksForUserProfile = getRecentTasksForUserProfile;
exports.revealTask = revealTask;
exports.deleteTask = deleteTask;
exports.markTaskAsDone = markTaskAsDone;
exports.markTaskAsNotDone = markTaskAsNotDone;
exports.shareTaskProgress = shareTaskProgress;
exports.getTaskViewCount = getTaskViewCount;
exports.increaseTaskViewCount = increaseTaskViewCount;
const AppError_1 = require("../../errors/AppError");
const client_1 = require("../../db/client");
const client_2 = require("@prisma/client");
const httpStatus_1 = require("../../types/httpStatus");
const scheduleReminderPush_1 = require("../../utils/scheduleReminderPush");
const notificationTextCatalog_1 = require("../../utils/notificationTextCatalog");
const notification_service_1 = require("../notification/notification.service");
const seededPush_service_1 = require("../seededPush/seededPush.service");
const scheduledPush_service_1 = require("../notification/scheduledPush.service");
const anonIdentity_1 = require("../../utils/anonIdentity");
const task_serializers_1 = require("./task.serializers");
const cheer_service_1 = require("../cheer/cheer.service");
const contentModeration_1 = require("../../utils/contentModeration");
const moderation_service_1 = require("../moderation/moderation.service");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const PROGRESS_UPDATE_COOLDOWN_MS = process.env.NODE_ENV === "production" ? 6 * HOUR_MS : MINUTE_MS;
/* -------------------------------------------------------
   INTERNAL UTILS
--------------------------------------------------------- */
function validateDecisionOptions(options) {
    if (!options || options.length < 2) {
        throw new AppError_1.AppError("Decision tasks must have at least two options.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    const normalized = options.map((o) => o.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
        throw new AppError_1.AppError("Decision options must be unique.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
}
function toProgressUpdateSummary(progressUpdate) {
    if (!progressUpdate)
        return null;
    return {
        text: progressUpdate.text,
        createdAt: progressUpdate.createdAt.toISOString(),
    };
}
function getProgressUpdateCooldownMessage(remainingMs) {
    if (PROGRESS_UPDATE_COOLDOWN_MS < HOUR_MS) {
        const remainingMinutes = Math.ceil(remainingMs / MINUTE_MS);
        return `You can only share a progress update every 1 minute. Try again in about ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}.`;
    }
    const remainingHours = Math.ceil(remainingMs / HOUR_MS);
    return `You can only share a progress update every 6 hours. Try again in about ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`;
}
async function checkDuplicateTask(text, userId, excludeId) {
    return client_1.prisma.task.findFirst({
        where: {
            text,
            userId,
            NOT: excludeId ? { id: excludeId } : undefined,
        },
    });
}
function hasHelpers(input) {
    return "helpers" in input && Array.isArray(input.helpers);
}
async function transformTasksForFeed(tasks, userId) {
    const taskIds = tasks.map((t) => t.id);
    const viewerId = userId ?? null;
    if (taskIds.length === 0) {
        return [];
    }
    const remindedTaskIds = new Set();
    if (viewerId) {
        const reminders = await client_1.prisma.reminderNote.findMany({
            where: { senderId: viewerId, taskId: { in: taskIds } },
            select: { taskId: true },
        });
        reminders.forEach((r) => remindedTaskIds.add(r.taskId));
    }
    const advisedTaskIds = new Set();
    if (viewerId) {
        const adviceComments = await client_1.prisma.comment.findMany({
            where: {
                userId: viewerId,
                taskId: { in: taskIds },
                task: { type: "advice" },
            },
            select: { taskId: true },
        });
        adviceComments.forEach((c) => advisedTaskIds.add(c.taskId));
    }
    const allVotes = await client_1.prisma.vote.findMany({
        where: { taskId: { in: taskIds } },
        select: {
            taskId: true,
            option: true,
            user: { select: { id: true, name: true, photo: true } },
        },
    });
    const voteMap = {};
    for (const { taskId, option, user } of allVotes) {
        if (!voteMap[taskId])
            voteMap[taskId] = {};
        if (!voteMap[taskId][option])
            voteMap[taskId][option] = { count: 0, voters: [] };
        voteMap[taskId][option].count++;
        voteMap[taskId][option].voters.push({ ...user, photo: user.photo ?? undefined });
    }
    const userVoteMap = {};
    if (viewerId) {
        const userVotes = await client_1.prisma.vote.findMany({
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
        const transformedVotes = Object.fromEntries(Object.entries(taskVotes).map(([opt, v]) => [
            opt,
            { count: v.count, preview: v.voters.slice(0, 4) },
        ]));
        // Anonymous tasks: replace the owner's identity with the task's alias for
        // everyone but the owner. The fake id never resolves to a profile.
        const masked = (0, task_serializers_1.isMaskedForViewer)(task, viewerId);
        return {
            ...cleanTask,
            userId: masked ? (0, anonIdentity_1.anonOwnerId)(task.id) : task.userId,
            name: masked ? anonAlias ?? "Anonymous" : task.name,
            avatar: masked ? "" : task.avatar,
            ...(masked && anonAvatarColor ? { avatarColor: anonAvatarColor } : {}),
            commentsCount: task._count.Comment,
            reminderNoteCount: task._count.ReminderNote,
            voteCount: task._count.Vote,
            helpersCount: task._count.helpers,
            pushCount: task.type === "motivation" ? task._count.Push : 0,
            hasPushed: viewerId && task.type === "motivation" ? (task.Push?.length ?? 0) > 0 : false,
            hasAdvised: viewerId && task.type === "advice" ? advisedTaskIds.has(task.id) : false,
            hasReminded: viewerId ? remindedTaskIds.has(task.id) : false,
            votes: transformedVotes,
            votedOption: viewerId ? userVoteMap[task.id] ?? null : null,
            hasVoted: viewerId ? Boolean(userVoteMap[task.id]) : false,
        };
    });
}
const FEED_SORTS = new Set(["all", "needs_push", "new", "almost_there"]);
function normalizeFeedSort(sort) {
    return sort && FEED_SORTS.has(sort) ? sort : "needs_push";
}
function getFeedCursorCondition(sort, cursor) {
    if (!cursor)
        return client_2.Prisma.empty;
    switch (sort) {
        case "all":
        case "new":
            return client_2.Prisma.sql `
        AND (
          t."createdAt" < ${cursor.created_at}
          OR (t."createdAt" = ${cursor.created_at} AND t.id < ${cursor.id})
        )
      `;
        case "almost_there":
            return client_2.Prisma.sql `
        AND (
          t."latestActivityAt" < ${cursor.latest_activity_at}
          OR (t."latestActivityAt" = ${cursor.latest_activity_at} AND t.id < ${cursor.id})
        )
      `;
        case "needs_push":
        default:
            return client_2.Prisma.sql `
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
function getFeedOrderBy(sort) {
    switch (sort) {
        case "all":
        case "new":
            return client_2.Prisma.sql `t."createdAt" DESC, t.id DESC`;
        case "almost_there":
            return client_2.Prisma.sql `t."latestActivityAt" DESC, t.id DESC`;
        case "needs_push":
        default:
            return client_2.Prisma.sql `t."pushCount" ASC, t."createdAt" DESC, t.id DESC`;
    }
}
async function getFeedCursorRow(cursorId, excludeUserId, blockedUserIds = []) {
    if (!cursorId)
        return null;
    const excludeSelfCondition = excludeUserId
        ? client_2.Prisma.sql `AND t."userId" <> ${excludeUserId}`
        : client_2.Prisma.empty;
    const blockedUsersCondition = blockedUserIds.length > 0
        ? client_2.Prisma.sql `AND t."userId" NOT IN (${client_2.Prisma.join(blockedUserIds)})`
        : client_2.Prisma.empty;
    const rows = await client_1.prisma.$queryRaw `
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
      ${excludeSelfCondition}
      ${blockedUsersCondition}
    LIMIT 1
  `;
    return rows[0] ?? null;
}
async function getOrderedFeedTaskIds({ sort, limit, cursorId, excludeUserId, blockedUserIds, }) {
    const excludeSelfCondition = excludeUserId
        ? client_2.Prisma.sql `AND t."userId" <> ${excludeUserId}`
        : client_2.Prisma.empty;
    const almostThereCondition = sort === "almost_there" ? client_2.Prisma.sql `AND t."isAlmostThere" = true` : client_2.Prisma.empty;
    const blockedUsersCondition = blockedUserIds && blockedUserIds.length > 0
        ? client_2.Prisma.sql `AND t."userId" NOT IN (${client_2.Prisma.join(blockedUserIds)})`
        : client_2.Prisma.empty;
    const cursor = await getFeedCursorRow(cursorId, excludeUserId, blockedUserIds);
    const cursorCondition = getFeedCursorCondition(sort, cursor);
    const orderBy = getFeedOrderBy(sort);
    return client_1.prisma.$queryRaw `
    SELECT t.id
    FROM "Task" t
    WHERE
      t."isPublic" = true
      AND t.type = 'motivation'
      AND t.completed = false
      AND t."completedAt" IS NULL
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
async function createTask(input) {
    const { text, userId, type } = input;
    (0, contentModeration_1.assertPostableContent)([
        text,
        ...(type === "decision" ? input.options ?? [] : []),
    ]);
    const existing = await checkDuplicateTask(text, userId);
    if (existing) {
        throw new AppError_1.AppError("You already created this task.", httpStatus_1.HttpStatus.CONFLICT);
    }
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, photo: true, fcmToken: true },
    });
    if (!user) {
        throw new AppError_1.AppError("User not found.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    const avatar = input.avatar ?? user.photo ?? undefined;
    const name = user.name;
    const isAnonymous = input.isAnonymous === true;
    let anonIdentity = null;
    if (isAnonymous) {
        if (hasHelpers(input) && input.helpers?.length) {
            throw new AppError_1.AppError("Anonymous goals can't tag friends.", httpStatus_1.HttpStatus.BAD_REQUEST);
        }
        const activeAnon = await client_1.prisma.task.findFirst({
            where: { userId, isAnonymous: true, completed: false },
            select: { id: true },
        });
        if (activeAnon) {
            throw new AppError_1.AppError("You already have an active anonymous goal. Complete it before starting another.", httpStatus_1.HttpStatus.CONFLICT);
        }
        anonIdentity = (0, anonIdentity_1.generateAnonIdentity)();
    }
    const remindAt = type === "reminder" ? input.remindAt : undefined;
    if (type === "decision") {
        validateDecisionOptions(input.options);
    }
    const options = type === "decision"
        ? input.options?.map((o) => o.trim()) ?? []
        : [];
    const deliverAt = type === "motivation" ? input.deliverAt ?? undefined : undefined;
    const helpers = hasHelpers(input) && input.helpers?.length
        ? { connect: input.helpers.map((id) => ({ id })) }
        : undefined;
    let createdTask;
    try {
        createdTask = await client_1.prisma.$transaction(async (tx) => {
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
    }
    catch (error) {
        // Partial unique index: one ACTIVE anonymous task per user. Concurrent
        // creates race past the pre-check; the index is the real guarantee.
        if (error instanceof client_2.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002" &&
            isAnonymous) {
            throw new AppError_1.AppError("You already have an active anonymous goal. Complete it before starting another.", httpStatus_1.HttpStatus.CONFLICT);
        }
        throw error;
    }
    /* ---------------------------
       Schedule reminder push
    ----------------------------- */
    if (type === "reminder" && remindAt) {
        const deliverAt = new Date(remindAt);
        if (deliverAt.getTime() > Date.now()) {
            const { title, body } = (0, notificationTextCatalog_1.getTaskReminderPushNotificationText)(text);
            await (0, scheduledPush_service_1.createScheduledPush)({
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
        const helperUsers = await client_1.prisma.user.findMany({
            where: { id: { in: input.helpers } },
            select: { id: true, fcmToken: true },
        });
        const helperNotificationText = (0, notificationTextCatalog_1.getHelperNotificationText)(type, text);
        await Promise.all(helperUsers.map((helper) => helper.fcmToken
            ? (0, scheduleReminderPush_1.schedulePush)(0, helper.fcmToken, helperNotificationText.title, helperNotificationText.body, {
                notificationType: "task-helper",
                taskId: createdTask.id,
                taskType: type,
                deeplinkPath: `/tasks/${createdTask.id}`,
                screen: "TaskDetail",
            })
            : undefined));
        await (0, notification_service_1.createTaskHelperNotifications)({
            helperIds: input.helpers,
            senderId: userId,
            taskId: createdTask.id,
            taskText: text,
        });
    }
    /* ---------------------------
       Schedule seeded launch pushes
    ----------------------------- */
    await (0, seededPush_service_1.scheduleSeededPushesForTask)(createdTask.id);
    return createdTask;
}
/* -------------------------------------------------------
   UPDATE TASK
--------------------------------------------------------- */
async function updateTask(id, data, userId) {
    const currentTask = await client_1.prisma.task.findUnique({
        where: { id },
        select: { userId: true, type: true, isAnonymous: true },
    });
    if (!currentTask) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (currentTask.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    // Anonymity is a one-way door: named→anon is never allowed (the goal has
    // already been seen with a name), and anon→named only happens through the
    // explicit reveal endpoint.
    if (data.isAnonymous !== undefined &&
        data.isAnonymous !== currentTask.isAnonymous) {
        throw new AppError_1.AppError("Anonymity can't be changed here. Anonymous goals can be revealed from the goal screen.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    if (currentTask.isAnonymous && "helpers" in data && data.helpers?.length) {
        throw new AppError_1.AppError("Anonymous goals can't tag friends.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    if (data.text || "options" in data) {
        (0, contentModeration_1.assertPostableContent)([
            data.text,
            ...("options" in data ? data.options ?? [] : []),
        ]);
    }
    if (data.text) {
        const duplicate = await checkDuplicateTask(data.text, currentTask.userId, id);
        if (duplicate) {
            throw new AppError_1.AppError("Duplicate task text.", httpStatus_1.HttpStatus.CONFLICT);
        }
    }
    const isHelperType = ["reminder", "motivation", "advice", "decision"].includes(currentTask.type);
    if ((data.type === "decision" || currentTask.type === "decision") &&
        "options" in data) {
        validateDecisionOptions(data.options);
    }
    const dataToUpdate = {
        text: data.text,
        name: data.name,
        type: data.type,
        feeling: data.feeling,
        remindAt: data.type === "reminder" ? data.remindAt : undefined,
        options: data.type === "decision"
            ? data.options?.map((o) => o.trim()) ?? []
            : [],
        deliverAt: data.type === "motivation" ? data.deliverAt : undefined,
        avatar: data.avatar,
        ...(isHelperType && "helpers" in data
            ? { helpers: { set: data.helpers?.map((id) => ({ id })) ?? [] } }
            : {}),
    };
    const updatedTask = await client_1.prisma.task.update({
        where: { id },
        data: dataToUpdate,
        include: { helpers: true },
    });
    // Reschedule the reminder push when the reminder time or type changes.
    const reminderAffected = "remindAt" in data || "type" in data || "text" in data;
    if (reminderAffected) {
        await (0, scheduledPush_service_1.cancelScheduledPushesForTask)(id);
        if (updatedTask.type === "reminder" &&
            updatedTask.remindAt &&
            updatedTask.remindAt.getTime() > Date.now()) {
            const { title, body } = (0, notificationTextCatalog_1.getTaskReminderPushNotificationText)(updatedTask.text);
            await (0, scheduledPush_service_1.createScheduledPush)({
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
async function getTaskById(taskId, userId) {
    // ---------------------------------
    // Fetch task with relations
    // ---------------------------------
    const task = await client_1.prisma.task.findUnique({
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
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (await (0, moderation_service_1.isTaskHiddenForViewer)(task.userId, userId)) {
        throw new AppError_1.AppError("This task is hidden.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    // ---------------------------------
    // 🔥 Increment view count (non-blocking)
    // ---------------------------------
    client_1.prisma.task.update({
        where: { id: taskId },
        data: { viewCount: { increment: 1 } },
    }).catch(() => { }); // prevent any crash from slowing down response
    // ---------------------------------
    // Voting logic
    // ---------------------------------
    const votes = task.Vote.reduce((acc, v) => {
        if (!acc[v.option])
            acc[v.option] = { count: 0, preview: [] };
        acc[v.option].count += 1;
        if (acc[v.option].preview.length < 3) {
            acc[v.option].preview.push({
                id: v.user.id,
                name: v.user.name,
                photo: v.user.photo ?? "",
            });
        }
        return acc;
    }, {});
    const votedOption = userId
        ? task.Vote.find((v) => v.userId === userId)?.option ?? null
        : null;
    const hasVoted = userId ? votedOption !== null : false;
    const { Vote, progressUpdates, Push, anonAlias, anonAvatarColor, ...taskData } = task;
    const maskedForViewer = (0, task_serializers_1.isMaskedForViewer)(task, userId);
    const progressUpdateHistory = progressUpdates
        .map((entry) => toProgressUpdateSummary(entry))
        .filter((entry) => entry !== null);
    // ---------------------------------
    // Include viewCount in response
    // ---------------------------------
    let hasAdvised = false;
    if (userId && task.type === "advice") {
        const advice = await client_1.prisma.comment.findFirst({
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
        const reminder = await client_1.prisma.reminderNote.findFirst({
            where: {
                taskId,
                senderId: userId,
            },
            select: { id: true },
        });
        hasReminded = !!reminder;
    }
    const pushItems = Array.isArray(Push)
        ? Push
        : [];
    const visiblePushItems = pushItems.filter((p) => p.user.id !== task.userId);
    const pushCount = task.type === "motivation"
        ? await client_1.prisma.push.count({
            where: {
                taskId,
                userId: { not: task.userId },
            },
        })
        : 0;
    const pushHistory = task.type === "motivation"
        ? visiblePushItems.map((p) => ({
            user: p.user,
            pushedAt: p.createdAt,
        }))
        : [];
    const cheerSummary = task.type === "motivation"
        ? await (0, cheer_service_1.getTaskCheerSummaryForTask)(taskId, userId)
        : {
            beats: [],
            cheerTotal: 0,
            distinctCheererCount: 0,
            sampleCheerers: [],
            mostCheeredBeatId: null,
        };
    return {
        ...taskData,
        userId: maskedForViewer ? (0, anonIdentity_1.anonOwnerId)(task.id) : task.userId,
        name: maskedForViewer ? anonAlias ?? "Anonymous" : task.name,
        avatar: maskedForViewer ? "" : task.avatar,
        ...(maskedForViewer && anonAvatarColor ? { avatarColor: anonAvatarColor } : {}),
        votes,
        votedOption,
        viewCount: task.viewCount,
        hasVoted,
        pushCount,
        hasPushed: userId && task.type === "motivation"
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
async function getAllTasks(userId, helpers) {
    const requestedLimit = helpers?.limit ?? 20;
    const normalizedLimit = Math.max(1, Math.min(requestedLimit, 50));
    const fetchLimit = normalizedLimit + 1;
    const sort = normalizeFeedSort(helpers?.sort);
    const cursorId = helpers?.cursor?.trim();
    const excludeUserId = helpers?.excludeSelf && userId ? userId : null;
    const blockedUserIds = await (0, moderation_service_1.getBlockedUserIdsForViewer)(userId ?? null);
    const orderedIds = await getOrderedFeedTaskIds({
        sort,
        limit: fetchLimit,
        cursorId,
        excludeUserId,
        blockedUserIds,
    });
    const hasMore = orderedIds.length === fetchLimit;
    const trimmedIds = hasMore ? orderedIds.slice(0, normalizedLimit) : orderedIds;
    const taskIds = trimmedIds.map((row) => row.id);
    const lastTaskId = taskIds[taskIds.length - 1] ?? null;
    if (taskIds.length === 0) {
        return {
            tasks: [],
            hasMore: false,
            nextCursor: null,
        };
    }
    const tasks = await client_1.prisma.task.findMany({
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
    const paginatedTasks = await transformTasksForFeed(sortedTasks, userId);
    return {
        tasks: paginatedTasks,
        hasMore,
        nextCursor: hasMore ? lastTaskId : null,
    };
}
async function getRecentTasksForUserProfile(targetUserId, currentUserId, limit = 5) {
    if (await (0, moderation_service_1.isTaskHiddenForViewer)(targetUserId, currentUserId)) {
        return [];
    }
    const recentTasks = await client_1.prisma.task.findMany({
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
    return transformTasksForFeed(recentTasks, currentUserId);
}
/* -------------------------------------------------------
   REVEAL ANONYMOUS TASK (one-way: anon → named)
--------------------------------------------------------- */
async function revealTask(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { userId: true, isAnonymous: true },
    });
    if (!task) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    if (!task.isAnonymous) {
        throw new AppError_1.AppError("This goal is already posted with your name.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    // anonAlias is kept on the row for history/moderation; it simply stops
    // being used once isAnonymous is false.
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { isAnonymous: false },
        include: { helpers: true },
    });
}
/* -------------------------------------------------------
   DELETE TASK
--------------------------------------------------------- */
async function deleteTask(id, userId) {
    const existing = await client_1.prisma.task.findUnique({ where: { id } });
    if (!existing) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (existing.userId !== userId) {
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    }
    await client_1.prisma.vote.deleteMany({ where: { taskId: id } });
    await (0, scheduledPush_service_1.cancelScheduledPushesForTask)(id);
    return client_1.prisma.task.delete({ where: { id } });
}
/* -------------------------------------------------------
   COMPLETE / UNCOMPLETE TASK
--------------------------------------------------------- */
async function markTaskAsDone(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        include: { helpers: { select: { id: true } } },
    });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    if (task.userId !== userId)
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    if (task.type === "decision" && task.helpers.length > 0) {
        const helperIds = task.helpers.map((h) => h.id);
        const helpers = await client_1.prisma.user.findMany({
            where: { id: { in: helperIds } },
            select: { fcmToken: true },
        });
        const decisionFinalizedNotificationText = (0, notificationTextCatalog_1.getDecisionFinalizedNotificationText)();
        await Promise.all(helpers.map((h) => h.fcmToken
            ? (0, scheduleReminderPush_1.schedulePush)(0, h.fcmToken, decisionFinalizedNotificationText.title, decisionFinalizedNotificationText.body, {
                notificationType: "decision-done",
                taskId: task.id,
                taskType: "decision",
                deeplinkPath: `/tasks/${task.id}`,
                screen: "TaskDetail",
            })
            : undefined));
        await (0, notification_service_1.createDecisionTaskDoneNotifications)({
            helperIds,
            senderId: userId,
            taskId: task.id,
            taskText: task.text,
        });
    }
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { completed: true, completedAt: new Date() },
    });
}
async function markTaskAsNotDone(taskId, userId) {
    const task = await client_1.prisma.task.findUnique({ where: { id: taskId } });
    if (!task)
        throw new AppError_1.AppError("Task not found", httpStatus_1.HttpStatus.NOT_FOUND);
    if (task.userId !== userId)
        throw new AppError_1.AppError("Unauthorized", httpStatus_1.HttpStatus.UNAUTHORIZED);
    return client_1.prisma.task.update({
        where: { id: taskId },
        data: { completed: false, completedAt: null },
    });
}
async function shareTaskProgress(taskId, senderId, text) {
    (0, contentModeration_1.assertPostableContent)([text]);
    const task = await client_1.prisma.task.findUnique({
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
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.type !== "motivation") {
        throw new AppError_1.AppError("Progress updates are only available for motivation tasks.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    if (task.completed) {
        throw new AppError_1.AppError("Completed tasks cannot receive progress updates.", httpStatus_1.HttpStatus.CONFLICT);
    }
    if (task.userId !== senderId) {
        throw new AppError_1.AppError("You can only share progress on your own task.", httpStatus_1.HttpStatus.FORBIDDEN);
    }
    const latestProgressUpdate = task.progressUpdates[0];
    if (latestProgressUpdate) {
        const elapsedMs = Date.now() - latestProgressUpdate.createdAt.getTime();
        if (elapsedMs < PROGRESS_UPDATE_COOLDOWN_MS) {
            const remainingMs = PROGRESS_UPDATE_COOLDOWN_MS - elapsedMs;
            const nextAllowedAt = new Date(Date.now() + remainingMs).toISOString();
            throw new AppError_1.AppError(getProgressUpdateCooldownMessage(remainingMs), httpStatus_1.HttpStatus.TOO_MANY_REQUESTS, true, { nextAllowedAt, remainingMs });
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
    const progressUpdate = await client_1.prisma.$transaction(async (tx) => {
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
    await (0, notification_service_1.createTaskProgressUpdateNotifications)({
        recipientIds,
        senderId,
        taskId,
        progressUpdateId: progressUpdate.id,
        taskText: task.text,
        progressText: text,
        taskType: task.type,
        senderName,
    });
    return toProgressUpdateSummary(progressUpdate);
}
async function getTaskViewCount(taskId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { viewCount: true, isPublic: true },
    });
    if (!task || !task.isPublic) {
        return null;
    }
    return task.viewCount;
}
async function increaseTaskViewCount(taskId) {
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, isPublic: true },
    });
    if (!task || !task.isPublic) {
        return false;
    }
    await client_1.prisma.task.update({
        where: { id: taskId },
        data: { viewCount: { increment: 1 } },
    });
    return true;
}
