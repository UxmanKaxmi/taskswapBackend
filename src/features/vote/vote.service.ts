import { prisma } from "../../db/client";
import { CastVoteInput } from "./vote.types";

// 🗳️ Cast or update a vote for a task
export async function castVoteForTask({
  userId,
  taskId,
  nextOption,
  prevOption, // (not needed for DB since we upsert per user, but kept for validation/logging)
  option,
}: CastVoteInput) {
  const chosen = (nextOption ?? option)?.trim();

  if (!chosen) {
    throw new Error("nextOption is required");
  }

  // Ensure task exists and is a decision with valid options
  const task = await prisma.task.findUnique({
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
  const vote = await prisma.vote.upsert({
    where: { userId_taskId: { userId, taskId } },
    update: { option: chosen },
    create: { userId, taskId, option: chosen },
  });
  console.log("🧠 Task options from DB:", task.options);
  console.log("🎯 Option received from client:", chosen);

  // Compute latest counts (groupBy is efficient)
  const grouped = await prisma.vote.groupBy({
    by: ["option"],
    where: { taskId },
    _count: { option: true },
  });

  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.option] = row._count.option;

  return {
    vote, // { userId, taskId, option }
    votedOption: chosen, // convenience
    prevOption: prevOption ?? null,
    counts, // { "Biryani": 12, "Korma": 9 }
    taskId,
  };
}

// 📊 Get vote breakdown for a task
export async function getVotesForTask(taskId: string) {
  const grouped = await prisma.vote.groupBy({
    by: ["option"],
    where: { taskId },
    _count: { option: true },
  });

  const result: Record<string, number> = {};
  for (const row of grouped) result[row.option] = row._count.option;
  return result;
}
