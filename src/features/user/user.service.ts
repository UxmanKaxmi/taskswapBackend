import { prisma } from "../../db/client";

export async function syncUserToDB({
  id,
  email,
  name,
  photo,
}: {
  id: string;
  email: string;
  name: string;
  photo?: string;
}) {
  return prisma.user.upsert({
    where: { id },
    update: { name, email, photo },
    create: { id, name, email, photo },
  });
}
