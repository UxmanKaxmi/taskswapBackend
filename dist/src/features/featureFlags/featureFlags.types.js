"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFeatureFlagKey = exports.DEFAULT_FEATURE_FLAGS = exports.FEATURE_FLAG_KEYS = void 0;
exports.FEATURE_FLAG_KEYS = [
    "motivation",
    "advice",
    "decision",
    "reminder",
];
exports.DEFAULT_FEATURE_FLAGS = {
    motivation: true,
    advice: true,
    decision: true,
    reminder: true,
};
const isFeatureFlagKey = (value) => exports.FEATURE_FLAG_KEYS.includes(value);
exports.isFeatureFlagKey = isFeatureFlagKey;
