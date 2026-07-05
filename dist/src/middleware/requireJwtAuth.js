"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireJwtAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const requireJwtAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        if (!decoded.userId) {
            res.status(401).json({ error: "Invalid token" });
            return;
        }
        req.user = { id: decoded.userId };
        next();
    }
    catch (err) {
        console.error("[JWT ERROR]", err);
        res.status(401).json({ error: "Invalid token" });
    }
};
exports.requireJwtAuth = requireJwtAuth;
