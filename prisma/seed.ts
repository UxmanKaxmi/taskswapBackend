// prisma/seed.ts
import { prisma } from "../src/db/client";

async function main() {
  console.log("🌱 Seeding database...");

  // Create or upsert a test user
  const user = await prisma.user.upsert({
    where: { email: "testuser@example.com" },
    update: {},
    create: {
      id: "test-user-id",
      email: "testuser@example.com",
      name: "Test User",
      photo: "https://example.com/photo.png",
    },
  });

  // Create sample tasks for this user
  await prisma.task.createMany({
    data: [
      {
        text: "Buy groceries",
        type: "reminder",
        userId: user.id,
        remindAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour later
      },
      {
        text: "Daily motivation",
        type: "motivation",
        userId: user.id,
        deliverAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day later
      },
      {
        text: "Choose dinner",
        type: "decision",
        userId: user.id,
        options: ["Pizza", "Burger", "Pasta"],
      },
      {
        text: "Reminder: Drink water",
        type: "reminder",
        userId: user.id,
        remindAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours later
      },
      {
        text: "Motivation Quote",
        type: "motivation",
        userId: user.id,
        deliverAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours later
      },
      {
        text: "Advice: How to focus?",
        type: "advice",
        userId: user.id,
      },
    ],
    skipDuplicates: true, // Avoid duplicate entries
  });

  console.log("✅ Seed data has been populated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
