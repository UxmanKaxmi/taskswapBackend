"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../db/client");
const seededUser_service_1 = require("../features/seededUser/seededUser.service");
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await client_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, origin: true },
        });
        if (!user || user.origin === seededUser_service_1.USER_ORIGIN.SEEDED) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        // ✅ Set as req.user for consistent usage
        req.user = { id: user.id };
        console.log("✅ JWT token:", token);
        console.log("✅ Decoded token:", decoded);
        console.log("✅ req.user:", req.user);
        next();
    }
    catch (err) {
        console.error("[JWT ERROR]", err);
        res.status(401).json({ error: "Invalid token" });
    }
};
exports.requireAuth = requireAuth;
