"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.castVote = castVote;
exports.getVotes = getVotes;
exports.handleGetVote = handleGetVote;
const vote_service_1 = require("./vote.service");
// POST /tasks/:id/vote
async function castVote(req, res, next) {
    try {
        const userId = req.user?.id;
        const taskId = req.params.id;
        // Accept both legacy { option } and new { nextOption, prevOption }
        const { nextOption, prevOption, option } = (req.body ?? {});
        const chosen = (nextOption ?? option)?.trim();
        if (!taskId) {
            res.status(400).json({ message: "Missing taskId" });
        }
        if (!userId) {
            res.status(400).json({ message: "Missing userId" });
        }
        if (!chosen) {
            res.status(400).json({ message: "nextOption is required" });
        }
        const result = await (0, vote_service_1.castVoteForTask)({
            userId: userId,
            taskId: taskId,
            nextOption: chosen,
            prevOption, // optional
        });
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
}
// GET /tasks/:id/votes
async function getVotes(req, res, next) {
    try {
        const taskId = req.params.id;
        if (!taskId) {
            res.status(400).json({ message: "Missing taskId" });
        }
        const results = await (0, vote_service_1.getVotesForTask)(taskId);
        res.status(200).json(results);
    }
    catch (error) {
        next(error);
    }
}
// (Optional) Test or dev route
async function handleGetVote(_req, res) {
    res.status(200).json({ message: "✅ Vote route is working" });
}
