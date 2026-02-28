"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParamString = getParamString;
function getParamString(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value)) {
        const first = value[0];
        return typeof first === "string" ? first : null;
    }
    return null;
}
