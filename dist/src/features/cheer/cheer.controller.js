"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCheerBeat = handleCheerBeat;
const zod_1 = require("zod");
const errors_1 = require("../../errors");
const params_1 = require("../../utils/params");
const cheer_service_1 = require("./cheer.service");
const cheer_schema_1 = require("./cheer.schema");
async function handleCheerBeat(req, res, next) {
    const userId = req.user?.id;
    const beatId = (0, params_1.getParamString)(req.params.beatId);
    if (!userId) {
        return next(new errors_1.BadRequestError("User ID is required"));
    }
    if (!beatId) {
        return next(new errors_1.BadRequestError("Beat ID is required"));
    }
    try {
        const parsed = cheer_schema_1.cheerSchema.parse(req.body);
        const result = await (0, cheer_service_1.cheerBeat)({
            beatId,
            userId,
            presetKey: parsed.presetKey,
        });
        res.status(200).json(result);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            res.status(400).json({
                error: "Validation error",
                issues: error.errors,
            });
            return;
        }
        next(error);
    }
}
