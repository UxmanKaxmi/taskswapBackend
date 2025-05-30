"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        // ✅ Set as req.user for consistent usage
        req.user = { id: decoded.userId };
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
