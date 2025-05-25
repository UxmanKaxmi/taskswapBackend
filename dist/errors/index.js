"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = exports.UnauthorizedError = exports.BadRequestError = void 0;
const AppError_1 = require("./AppError");
class BadRequestError extends AppError_1.AppError {
    constructor(message = "Bad Request") {
        super(message, 400);
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends AppError_1.AppError {
    constructor(message = "Unauthorized") {
        super(message, 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class NotFoundError extends AppError_1.AppError {
    constructor(message = "Not Found") {
        super(message, 404);
    }
}
exports.NotFoundError = NotFoundError;
