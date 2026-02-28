"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePush = togglePush;
exports.getPushes = getPushes;
exports.handleGetPush = handleGetPush;
const push_service_1 = require("./push.service");
const params_1 = require("../../utils/params");
// POST /tasks/:id/push
async function togglePush(req, res, next) {
    try {
        const userId = req.user?.id;
        const taskId = (0, params_1.getParamString)(req.params.id);
        if (!taskId) {
            res.status(400).json({ message: "Missing taskId" });
            return;
        }
        if (!userId) {
            res.status(400).json({ message: "Missing userId" });
            return;
        }
        const result = await (0, push_service_1.togglePushForTask)({
            userId: userId,
            taskId: taskId,
        });
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
}
// GET /tasks/:id/pushes
async function getPushes(req, res, next) {
    try {
        const taskId = (0, params_1.getParamString)(req.params.id);
        if (!taskId) {
            res.status(400).json({ message: "Missing taskId" });
            return;
        }
        const results = await (0, push_service_1.getPushesForTask)(taskId, req.user?.id);
        res.status(200).json(results);
    }
    catch (error) {
        next(error);
    }
}
// (Optional) Test or dev route
async function handleGetPush(_req, res) {
    res.status(200).json({ message: "✅ Push route is working" });
}
