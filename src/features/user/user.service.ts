import { User } from "@prisma/client";
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

export async function matchUsersByEmail(
  emails: string[]
): Promise<Pick<User, "id" | "email" | "name" | "photo">[]> {
  // normalize to lowercase
  const normalized = emails.map((e) => e.toLowerCase());
  return prisma.user.findMany({
    where: { email: { in: normalized } },
    select: { id: true, email: true, name: true, photo: true },
  });
}
