"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.touchUserActivity = touchUserActivity;
const client_1 = require("../db/client");
function touchUserActivity(userId) {
    return client_1.prisma.user
        .update({
        where: { id: userId },
        data: { lastOpenedAt: new Date() },
    })
        .catch(() => { });
}
