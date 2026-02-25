"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const optionalAuth = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    // ------------------------------------------
    // 1) No token → treat as guest
    // ------------------------------------------
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        req.user = undefined;
        return next();
    }
    const token = authHeader.split(" ")[1];
    try {
        // ------------------------------------------
        // 2) Verify token (same logic as requireAuth)
        // ------------------------------------------
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.userId };
    }
    catch (err) {
        console.error("[OPTIONAL AUTH ERROR]", err);
        // ------------------------------------------
        // 3) Invalid token → still allow the request
        // ------------------------------------------
        req.user = undefined;
    }
    next();
};
exports.optionalAuth = optionalAuth;
