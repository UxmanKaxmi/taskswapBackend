"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateComment = handleCreateComment;
exports.handleGetComments = handleGetComments;
exports.handleToggleLike = handleToggleLike;
const comment_service_1 = require("./comment.service");
const comment_schema_1 = require("./comment.schema");
const errors_1 = require("../../errors");
async function handleCreateComment(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const parsed = comment_schema_1.createCommentSchema.parse(req.body);
        const comment = await (0, comment_service_1.createComment)({ ...parsed, userId });
        res.status(201).json(comment);
    }
    catch (error) {
        next(error);
    }
}
async function handleGetComments(req, res, next) {
    const userId = req.user?.id;
    const { taskId } = req.params;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const comments = await (0, comment_service_1.getCommentsForTask)(taskId, userId);
        res.status(200).json(comments);
    }
    catch (error) {
        next(error);
    }
}
async function handleToggleLike(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    try {
        const { commentId, like } = req.body;
        await (0, comment_service_1.toggleCommentLike)(commentId, userId, like);
        res.status(200).json({ success: true });
    }
    catch (error) {
        next(error);
    }
}
