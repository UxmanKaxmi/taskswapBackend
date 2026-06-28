"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFeedback = createFeedback;
const client_1 = require("../../db/client");
async function createFeedback(input, authUserId) {
    // Prefer the authenticated user; fall back to the id the client reported.
    const userId = authUserId ?? input.loggedInUserId ?? null;
    // Only link the feedback to a user that actually exists, so a stale/guest id
    // can't break the insert via the foreign key.
    let linkedUserId = null;
    if (userId) {
        const exists = await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        linkedUserId = exists ? userId : null;
    }
    return client_1.prisma.feedback.create({
        data: {
            category: input.category ?? null,
            message: input.message,
            appVersion: input.appVersion,
            platform: input.platform,
            device: input.device ?? null,
            osVersion: input.osVersion ?? null,
            currentScreen: input.currentScreen ?? null,
            timeSubmitted: input.timeSubmitted,
            userId: linkedUserId,
        },
        select: { id: true, createdAt: true },
    });
}
