"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeatureFlagsForUser = getFeatureFlagsForUser;
exports.updateFeatureFlagsForUser = updateFeatureFlagsForUser;
const client_1 = require("../../db/client");
const featureFlags_types_1 = require("./featureFlags.types");
const toDTO = (row) => ({
    motivation: row.motivation,
    advice: row.advice,
    decision: row.decision,
    reminder: row.reminder,
});
async function getFeatureFlagsForUser(userId) {
    const existing = await client_1.prisma.featureFlags.findUnique({
        where: { userId },
    });
    const record = existing ??
        (await client_1.prisma.featureFlags.create({
            data: { userId, ...featureFlags_types_1.DEFAULT_FEATURE_FLAGS },
        }));
    return { features: toDTO(record) };
}
async function updateFeatureFlagsForUser(userId, updates) {
    const record = await client_1.prisma.featureFlags.upsert({
        where: { userId },
        create: { userId, ...featureFlags_types_1.DEFAULT_FEATURE_FLAGS, ...updates },
        update: updates,
    });
    return { features: toDTO(record) };
}
