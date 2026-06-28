"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSubmitFeedback = void 0;
const zod_1 = require("zod");
const feedback_schema_1 = require("./feedback.schema");
const feedback_service_1 = require("./feedback.service");
const handleSubmitFeedback = async (req, res, next) => {
    try {
        const input = feedback_schema_1.submitFeedbackSchema.parse(req.body);
        const result = await (0, feedback_service_1.createFeedback)(input, req.user?.id);
        res.status(201).json({ success: true, id: result.id });
    }
    catch (err) {
        if (err instanceof zod_1.ZodError) {
            res.status(400).json({
                error: "Invalid feedback payload",
                details: err.flatten().fieldErrors,
            });
            return;
        }
        console.error("[SUBMIT_FEEDBACK_ERROR]", err);
        next(err);
    }
};
exports.handleSubmitFeedback = handleSubmitFeedback;
