"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../db/client");
const seededUser_service_1 = require("../features/seededUser/seededUser.service");
const optionalAuth = async (req, _res, next) => {
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
        const user = await client_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, origin: true },
        });
        req.user = user && user.origin !== seededUser_service_1.USER_ORIGIN.SEEDED ? { id: user.id } : undefined;
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError || err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            req.user = undefined;
            return next();
        }
        console.warn("[OPTIONAL AUTH ERROR]", err instanceof Error ? err.message : err);
        // ------------------------------------------
        // 3) Invalid token → still allow the request
        // ------------------------------------------
        req.user = undefined;
    }
    next();
};
exports.optionalAuth = optionalAuth;
