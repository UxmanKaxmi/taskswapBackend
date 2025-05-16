// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Upsert a “seed” user
  const user = await prisma.user.upsert({
    where: { id: "seed-user-id" },
    create: {
      id: "seed-user-id",
      email: "seed@example.com",
      name: "Seed User",
      photo: null,
    },
    update: {
      email: "seed@example.com",
      name: "Seed User",
      photo: null,
    },
  });
  console.log("✅ Upserted user:", user);

  // 2) Create a test task for that user
  const newTask = await prisma.task.create({
    data: {
      text: "Test task from script",
      type: "reminder",
      user: { connect: { id: user.id } },
      // You can also set remindAt, options or deliverAt here if you like:
      // remindAt: new Date(Date.now() + 1000 * 60 * 60),
      // options: ["A", "B"],
      // deliverAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });
  console.log("✅ Created task:", newTask);

  // 3) Fetch and print all tasks
  const allTasks = await prisma.task.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("📋 All tasks:", allTasks);
}

main()
  .catch((e) => {
    console.error("❌ Seed script error:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
