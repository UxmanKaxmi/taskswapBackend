"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const env = process.env.NODE_ENV;
const candidates = env === "production"
    ? [".env.production", ".env"]
    : env === "test"
        ? [".env.test", ".env"]
        : env === "development"
            ? [".env.dev", ".env"]
            : [".env", ".env.dev", ".env.test", ".env.production"];
for (const file of candidates) {
    const fullPath = path_1.default.resolve(process.cwd(), file);
    if (fs_1.default.existsSync(fullPath)) {
        dotenv_1.default.config({ path: fullPath });
    }
}
