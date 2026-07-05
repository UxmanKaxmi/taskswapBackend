"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const AppError_1 = require("../errors/AppError");
const requireAdmin = (req, _res, next) => {
    const userId = req.user?.id;
    const adminIds = (process.env.ADMIN_USER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    if (!userId) {
        return next(new AppError_1.AppError("Unauthorized", 401));
    }
    if (!adminIds.includes(userId)) {
        return next(new AppError_1.AppError("Forbidden", 403));
    }
    return next();
};
exports.requireAdmin = requireAdmin;
