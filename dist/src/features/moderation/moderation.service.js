"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportTask = reportTask;
exports.blockUser = blockUser;
exports.unblockUser = unblockUser;
exports.listBlockedUsers = listBlockedUsers;
exports.listReports = listReports;
exports.updateReportStatus = updateReportStatus;
exports.getBlockedUserIdsForViewer = getBlockedUserIdsForViewer;
exports.isTaskHiddenForViewer = isTaskHiddenForViewer;
const client_1 = require("@prisma/client");
const client_2 = require("../../db/client");
const AppError_1 = require("../../errors/AppError");
const httpStatus_1 = require("../../types/httpStatus");
const DEFAULT_REPORT_LIMIT = 50;
const MAX_REPORT_LIMIT = 100;
async function reportTask(reporterId, taskId, input) {
    const task = await client_2.prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            userId: true,
            isPublic: true,
        },
    });
    if (!task || !task.isPublic) {
        throw new AppError_1.AppError("Task not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    if (task.userId === reporterId) {
        throw new AppError_1.AppError("You cannot report your own task.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    const report = await client_2.prisma.taskReport.create({
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
async function blockUser(blockerId, blockedId) {
    if (blockerId === blockedId) {
        throw new AppError_1.AppError("You cannot block yourself.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    const blockedUser = await client_2.prisma.user.findUnique({
        where: { id: blockedId },
        select: { id: true },
    });
    if (!blockedUser) {
        throw new AppError_1.AppError("User not found.", httpStatus_1.HttpStatus.NOT_FOUND);
    }
    const block = await client_2.prisma.$transaction(async (tx) => {
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
async function unblockUser(blockerId, blockedId) {
    if (blockerId === blockedId) {
        throw new AppError_1.AppError("You cannot unblock yourself.", httpStatus_1.HttpStatus.BAD_REQUEST);
    }
    const deleted = await client_2.prisma.userBlock.deleteMany({
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
async function listBlockedUsers(blockerId) {
    const blocks = await client_2.prisma.userBlock.findMany({
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
async function listReports(filters) {
    const limit = Math.max(1, Math.min(filters.limit ?? DEFAULT_REPORT_LIMIT, MAX_REPORT_LIMIT));
    return client_2.prisma.taskReport.findMany({
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
async function updateReportStatus(reportId, status) {
    const data = {
        status,
        reviewedAt: status === "pending" ? null : new Date(),
    };
    try {
        return await client_2.prisma.taskReport.update({
            where: { id: reportId },
            data,
            select: {
                id: true,
                status: true,
                reviewedAt: true,
                updatedAt: true,
            },
        });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025") {
            throw new AppError_1.AppError("Report not found.", httpStatus_1.HttpStatus.NOT_FOUND);
        }
        throw error;
    }
}
async function getBlockedUserIdsForViewer(userId) {
    if (!userId)
        return [];
    const blocks = await client_2.prisma.userBlock.findMany({
        where: {
            OR: [{ blockerId: userId }, { blockedId: userId }],
        },
        select: {
            blockerId: true,
            blockedId: true,
        },
    });
    return [
        ...new Set(blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId)),
    ];
}
async function isTaskHiddenForViewer(taskOwnerId, viewerId) {
    if (!viewerId || taskOwnerId === viewerId)
        return false;
    const block = await client_2.prisma.userBlock.findFirst({
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
