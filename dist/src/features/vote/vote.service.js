"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.castVoteForTask = castVoteForTask;
exports.getVotesForTask = getVotesForTask;
const client_1 = require("../../db/client");
// 🗳️ Cast or update a vote for a task
async function castVoteForTask({ userId, taskId, nextOption, prevOption, // (not needed for DB since we upsert per user, but kept for validation/logging)
option, }) {
    const chosen = (nextOption ?? option)?.trim();
    if (!chosen) {
        throw new Error("nextOption is required");
    }
    // Ensure task exists and is a decision with valid options
    const task = await client_1.prisma.task.findUnique({
        where: { id: taskId },
        select: { options: true, type: true },
    });
    if (!task || task.type !== "decision") {
        throw new Error("Task not found or is not a decision type");
    }
    if (!task.options?.includes(chosen)) {
        throw new Error("Invalid voting option");
    }
    // Upsert ensures: create on first vote, update when changing vote
    const vote = await client_1.prisma.vote.upsert({
        where: { userId_taskId: { userId, taskId } },
        update: { option: chosen },
        create: { userId, taskId, option: chosen },
    });
    console.log("🧠 Task options from DB:", task.options);
    console.log("🎯 Option received from client:", chosen);
    // Compute latest counts (groupBy is efficient)
    const grouped = await client_1.prisma.vote.groupBy({
        by: ["option"],
        where: { taskId },
        _count: { option: true },
    });
    const counts = {};
    for (const row of grouped)
        counts[row.option] = row._count.option;
    return {
        vote, // { userId, taskId, option }
        votedOption: chosen, // convenience
        prevOption: prevOption ?? null,
        counts, // { "Biryani": 12, "Korma": 9 }
        taskId,
    };
}
// 📊 Get vote breakdown for a task
async function getVotesForTask(taskId) {
    const grouped = await client_1.prisma.vote.groupBy({
        by: ["option"],
        where: { taskId },
        _count: { option: true },
    });
    const result = {};
    for (const row of grouped)
        result[row.option] = row._count.option;
    return result;
}
