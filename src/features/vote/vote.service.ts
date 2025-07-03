import { prisma } from "../../db/client";
import { CastVoteInput } from "./vote.types";

// 🗳️ Cast or update a vote for a task
export async function castVoteForTask({
  userId,
  taskId,
  option,
}: CastVoteInput) {
  // Make sure the task exists and supports options
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { options: true, type: true },
  });

  if (!task || task.type !== "decision") {
    throw new Error("Task not found or is not a decision type");
  }

  if (!task.options?.includes(option)) {
    throw new Error("Invalid voting option");
  }

  // Create or update the vote
  const vote = await prisma.vote.upsert({
    where: {
      userId_taskId: {
        userId,
        taskId,
      },
    },
    update: { option },
    create: { userId, taskId, option },
  });

  return vote;
}

// 📊 Get vote breakdown for a task
export async function getVotesForTask(taskId: string) {
  const votes = await prisma.vote.findMany({
    where: { taskId },
    select: {
      option: true,
    },
  });

  const result: Record<string, number> = {};

  for (const { option } of votes) {
    result[option] = (result[option] || 0) + 1;
  }

  return result;
}
