import { prisma } from "../db/client";

export function touchUserActivity(userId: string) {
  return prisma.user
    .update({
      where: { id: userId },
      data: { lastOpenedAt: new Date() },
    })
    .catch(() => {});
}
