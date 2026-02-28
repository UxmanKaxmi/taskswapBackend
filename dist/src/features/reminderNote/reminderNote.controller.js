"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendReminderNote = handleSendReminderNote;
exports.handleGetRemindersByTask = handleGetRemindersByTask;
const reminderNote_service_1 = require("./reminderNote.service");
const errors_1 = require("../../errors");
const params_1 = require("../../utils/params");
async function handleSendReminderNote(req, res, next) {
    try {
        const { message } = req.body;
        const taskId = (0, params_1.getParamString)(req.params.id);
        const senderId = req.user?.id;
        if (!senderId) {
            return next(new errors_1.BadRequestError("User ID is missing from request."));
        }
        if (!taskId) {
            return next(new errors_1.BadRequestError("Task ID is required."));
        }
        const note = await (0, reminderNote_service_1.sendReminderNote)({ taskId, senderId, message });
        res.status(201).json(note);
    }
    catch (error) {
        next(error);
    }
}
async function handleGetRemindersByTask(req, res, next) {
    try {
        const taskId = (0, params_1.getParamString)(req.params.id);
        const userId = req.user?.id ?? null; // <-- ⭐ PUBLIC SUPPORT
        if (!taskId) {
            return next(new errors_1.BadRequestError("Task ID is required."));
        }
        const notes = await (0, reminderNote_service_1.getRemindersByTask)(taskId, userId);
        res.status(200).json(notes);
    }
    catch (error) {
        next(error);
    }
}
