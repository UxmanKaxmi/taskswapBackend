"use strict";
// src/errors/AppError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        // Set the prototype explicitly (important when using `extends Error`)
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
