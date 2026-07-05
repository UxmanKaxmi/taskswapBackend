"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReportTask = handleReportTask;
exports.handleBlockUser = handleBlockUser;
exports.handleUnblockUser = handleUnblockUser;
exports.handleListBlockedUsers = handleListBlockedUsers;
exports.handleListReports = handleListReports;
exports.handleUpdateReportStatus = handleUpdateReportStatus;
const AppError_1 = require("../../errors/AppError");
const params_1 = require("../../utils/params");
const moderation_service_1 = require("./moderation.service");
const moderation_schema_1 = require("./moderation.schema");
async function handleReportTask(req, res, next) {
    const reporterId = req.user?.id;
    const taskId = (0, params_1.getParamString)(req.params.taskId);
    if (!reporterId)
        return next(new AppError_1.AppError("Unauthorized", 401));
    if (!taskId)
        return next(new AppError_1.AppError("Task ID is required", 400));
    try {
        const parsed = moderation_schema_1.reportTaskSchema.parse(req.body);
        const report = await (0, moderation_service_1.reportTask)(reporterId, taskId, parsed);
        res.status(201).json({
            ...report,
            message: "Thanks. We'll review this report.",
        });
    }
    catch (error) {
        next(error);
    }
}
async function handleBlockUser(req, res, next) {
    const blockerId = req.user?.id;
    const blockedId = (0, params_1.getParamString)(req.params.userId);
    if (!blockerId)
        return next(new AppError_1.AppError("Unauthorized", 401));
    if (!blockedId)
        return next(new AppError_1.AppError("User ID is required", 400));
    try {
        const result = await (0, moderation_service_1.blockUser)(blockerId, blockedId);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
}
async function handleUnblockUser(req, res, next) {
    const blockerId = req.user?.id;
    const blockedId = (0, params_1.getParamString)(req.params.userId);
    if (!blockerId)
        return next(new AppError_1.AppError("Unauthorized", 401));
    if (!blockedId)
        return next(new AppError_1.AppError("User ID is required", 400));
    try {
        const result = await (0, moderation_service_1.unblockUser)(blockerId, blockedId);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
}
async function handleListBlockedUsers(req, res, next) {
    const blockerId = req.user?.id;
    if (!blockerId)
        return next(new AppError_1.AppError("Unauthorized", 401));
    try {
        const blockedUsers = await (0, moderation_service_1.listBlockedUsers)(blockerId);
        res.status(200).json(blockedUsers);
    }
    catch (error) {
        next(error);
    }
}
async function handleListReports(req, res, next) {
    try {
        const status = (0, params_1.getParamString)(req.query.status);
        const limitQuery = (0, params_1.getParamString)(req.query.limit);
        const limit = limitQuery ? Number(limitQuery) : undefined;
        if (status && !moderation_schema_1.REPORT_STATUSES.includes(status)) {
            return next(new AppError_1.AppError("Invalid report status", 400));
        }
        const reports = await (0, moderation_service_1.listReports)({
            status: status,
            limit: Number.isFinite(limit) ? limit : undefined,
        });
        res.status(200).json({ data: reports });
    }
    catch (error) {
        next(error);
    }
}
async function handleUpdateReportStatus(req, res, next) {
    const reportId = (0, params_1.getParamString)(req.params.reportId);
    if (!reportId)
        return next(new AppError_1.AppError("Report ID is required", 400));
    try {
        const parsed = moderation_schema_1.reportStatusUpdateSchema.parse(req.body);
        const report = await (0, moderation_service_1.updateReportStatus)(reportId, parsed.status);
        res.status(200).json(report);
    }
    catch (error) {
        next(error);
    }
}
