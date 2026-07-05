import { Request, Response, NextFunction } from "express";
import { ReportStatus } from "@prisma/client";
import { AppError } from "../../errors/AppError";
import { getParamString } from "../../utils/params";
import {
  blockUser,
  listBlockedUsers,
  listReports,
  reportTask,
  unblockUser,
  updateReportStatus,
} from "./moderation.service";
import {
  REPORT_STATUSES,
  reportStatusUpdateSchema,
  reportTaskSchema,
} from "./moderation.schema";

export async function handleReportTask(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const reporterId = req.user?.id;
  const taskId = getParamString(req.params.taskId);

  if (!reporterId) return next(new AppError("Unauthorized", 401));
  if (!taskId) return next(new AppError("Task ID is required", 400));

  try {
    const parsed = reportTaskSchema.parse(req.body);
    const report = await reportTask(reporterId, taskId, parsed);
    res.status(201).json({
      ...report,
      message: "Thanks. We'll review this report.",
    });
  } catch (error) {
    next(error);
  }
}

export async function handleBlockUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const blockerId = req.user?.id;
  const blockedId = getParamString(req.params.userId);

  if (!blockerId) return next(new AppError("Unauthorized", 401));
  if (!blockedId) return next(new AppError("User ID is required", 400));

  try {
    const result = await blockUser(blockerId, blockedId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleUnblockUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const blockerId = req.user?.id;
  const blockedId = getParamString(req.params.userId);

  if (!blockerId) return next(new AppError("Unauthorized", 401));
  if (!blockedId) return next(new AppError("User ID is required", 400));

  try {
    const result = await unblockUser(blockerId, blockedId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleListBlockedUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const blockerId = req.user?.id;

  if (!blockerId) return next(new AppError("Unauthorized", 401));

  try {
    const blockedUsers = await listBlockedUsers(blockerId);
    res.status(200).json(blockedUsers);
  } catch (error) {
    next(error);
  }
}

export async function handleListReports(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const status = getParamString(req.query.status);
    const limitQuery = getParamString(req.query.limit);
    const limit = limitQuery ? Number(limitQuery) : undefined;

    if (status && !REPORT_STATUSES.includes(status as ReportStatus)) {
      return next(new AppError("Invalid report status", 400));
    }

    const reports = await listReports({
      status: status as ReportStatus | undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    res.status(200).json({ data: reports });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateReportStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const reportId = getParamString(req.params.reportId);

  if (!reportId) return next(new AppError("Report ID is required", 400));

  try {
    const parsed = reportStatusUpdateSchema.parse(req.body);
    const report = await updateReportStatus(reportId, parsed.status as ReportStatus);
    res.status(200).json(report);
  } catch (error) {
    next(error);
  }
}
