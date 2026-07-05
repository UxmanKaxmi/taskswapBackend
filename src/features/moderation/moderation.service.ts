import { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { ReportTaskInput } from "./moderation.schema";

const DEFAULT_REPORT_LIMIT = 50;
const MAX_REPORT_LIMIT = 100;

export async function reportTask(
  reporterId: string,
  taskId: string,
  input: ReportTaskInput
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      userId: true,
      isPublic: true,
    },
  });

  if (!task || !task.isPublic) {
    throw new AppError("Task not found.", HttpStatus.NOT_FOUND);
  }

  if (task.userId === reporterId) {
    throw new AppError("You cannot report your own task.", HttpStatus.BAD_REQUEST);
  }

  const report = await prisma.taskReport.create({
    data: {
      reporterId,
      taskId,
      reportedUserId: task.userId,
      reason: input.reason,
      details: input.details,
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  console.warn("[MODERATION_REPORT_CREATED]", {
    reportId: report.id,
    reporterId,
    taskId,
    reportedUserId: task.userId,
    reason: input.reason,
  });

  return report;
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new AppError("You cannot block yourself.", HttpStatus.BAD_REQUEST);
  }

  const blockedUser = await prisma.user.findUnique({
    where: { id: blockedId },
    select: { id: true },
  });

  if (!blockedUser) {
    throw new AppError("User not found.", HttpStatus.NOT_FOUND);
  }

  const block = await prisma.$transaction(async (tx) => {
    const createdBlock = await tx.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
      update: {},
      create: {
        blockerId,
        blockedId,
      },
      select: {
        id: true,
        blockedId: true,
        createdAt: true,
      },
    });

    await tx.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });

    return createdBlock;
  });

  return { success: true, blockedUserId: block.blockedId, createdAt: block.createdAt };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new AppError("You cannot unblock yourself.", HttpStatus.BAD_REQUEST);
  }

  const deleted = await prisma.userBlock.deleteMany({
    where: {
      blockerId,
      blockedId,
    },
  });

  return {
    success: true,
    unblockedUserId: blockedId,
    removed: deleted.count > 0,
  };
}

export async function listBlockedUsers(blockerId: string) {
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      blocked: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          photo: true,
        },
      },
    },
  });

  return blocks.map((block) => ({
    id: block.blocked.id,
    name: block.blocked.name,
    username: block.blocked.username,
    email: block.blocked.email,
    photo: block.blocked.photo,
    blockedAt: block.createdAt,
  }));
}

export async function listReports(filters: {
  status?: ReportStatus;
  limit?: number;
}) {
  const limit = Math.max(
    1,
    Math.min(filters.limit ?? DEFAULT_REPORT_LIMIT, MAX_REPORT_LIMIT)
  );

  return prisma.taskReport.findMany({
    where: filters.status ? { status: filters.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      reporter: {
        select: { id: true, name: true, email: true, photo: true },
      },
      reportedUser: {
        select: { id: true, name: true, email: true, photo: true },
      },
      task: {
        select: {
          id: true,
          text: true,
          type: true,
          createdAt: true,
          isPublic: true,
        },
      },
    },
  });
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus
) {
  const data: Prisma.TaskReportUpdateInput = {
    status,
    reviewedAt: status === "pending" ? null : new Date(),
  };

  try {
    return await prisma.taskReport.update({
      where: { id: reportId },
      data,
      select: {
        id: true,
        status: true,
        reviewedAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new AppError("Report not found.", HttpStatus.NOT_FOUND);
    }

    throw error;
  }
}

export async function getBlockedUserIdsForViewer(userId: string | null) {
  if (!userId) return [];

  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }],
    },
    select: {
      blockerId: true,
      blockedId: true,
    },
  });

  return [
    ...new Set(
      blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId
      )
    ),
  ];
}

export async function isTaskHiddenForViewer(
  taskOwnerId: string,
  viewerId?: string | null
) {
  if (!viewerId || taskOwnerId === viewerId) return false;

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: taskOwnerId },
        { blockerId: taskOwnerId, blockedId: viewerId },
      ],
    },
    select: { id: true },
  });

  return Boolean(block);
}
