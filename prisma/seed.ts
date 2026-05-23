// prisma/seed.ts
// prisma/seed.ts

import { PrismaClient } from "@prisma/client";

import { seedSeededUsers } from "../src/features/seededUser/seededUser.service.ts";

const prisma = new PrismaClient();

type SeedUser = {

  email: string;

  name: string;

  photo?: string | null;

};

type SeedTask = {
  key: string;
  userEmail: string;
  text: string;
  type: "reminder" | "advice" | "decision" | "motivation";
  remindAt?: Date | null;
  deliverAt?: Date | null;
  options?: string[];
  helpers?: string[];
  completed?: boolean;
};

const now = new Date();
const inHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

async function main() {
  console.log("Seeding database...");

  const seedUsers: SeedUser[] = [
    {
      email: "testuser@example.com",
      name: "Test User",
      photo: "https://example.com/photo.png",
    },
    {
      email: "alex@example.com",
      name: "Alex Rivera",
      photo: "https://example.com/alex.png",
    },
    {
      email: "bri@example.com",
      name: "Bri Chen",
      photo: "https://example.com/bri.png",
    },
    {
      email: "chris@example.com",
      name: "Chris Patel",
      photo: "https://example.com/chris.png",
    },
  ];

  await seedSeededUsers(prisma);

  const userByEmail = new Map<string, { id: string; email: string }>();
  for (const user of seedUsers) {
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, photo: user.photo ?? null },
      create: {
        email: user.email,
        name: user.name,
        photo: user.photo ?? null,
      },
    });
    userByEmail.set(user.email, record);
  }

  const seedTasks: SeedTask[] = [
    {
      key: "reminder-groceries",
      userEmail: "testuser@example.com",
      text: "Buy groceries",
      type: "reminder",
      remindAt: inHours(1),
    },
    {
      key: "motivation-morning",
      userEmail: "testuser@example.com",
      text: "Morning motivation check-in",
      type: "motivation",
      deliverAt: inHours(8),
    },
    {
      key: "decision-dinner",
      userEmail: "testuser@example.com",
      text: "Choose dinner",
      type: "decision",
      options: ["Pizza", "Burger", "Pasta"],
    },
    {
      key: "advice-focus",
      userEmail: "alex@example.com",
      text: "How can I improve focus during work?",
      type: "advice",
      helpers: ["bri@example.com"],
    },
    {
      key: "reminder-rent",
      userEmail: "bri@example.com",
      text: "Pay rent",
      type: "reminder",
      remindAt: inDays(1),
      helpers: ["chris@example.com"],
    },
    {
      key: "decision-weekend",
      userEmail: "chris@example.com",
      text: "Pick a weekend activity",
      type: "decision",
      options: ["Hiking", "Movie night", "Brunch"],
    },
    {
      key: "motivation-midweek",
      userEmail: "alex@example.com",
      text: "Midweek momentum boost",
      type: "motivation",
      deliverAt: inDays(2),
    },
    {
      key: "advice-workout",
      userEmail: "bri@example.com",
      text: "Suggestions for a 30-minute workout routine?",
      type: "advice",
      helpers: ["testuser@example.com"],
    },
    {
      key: "reminder-water",
      userEmail: "chris@example.com",
      text: "Drink water every 2 hours",
      type: "reminder",
      remindAt: inHours(2),
      completed: true,
    },
  ];

  const taskByKey = new Map<string, { id: string; type: string }>();
  for (const task of seedTasks) {
    const owner = userByEmail.get(task.userEmail);
    if (!owner) {
      throw new Error(`Missing user for task: ${task.userEmail}`);
    }

    const helperIds = (task.helpers ?? [])
      .map((email) => userByEmail.get(email)?.id)
      .filter((id): id is string => Boolean(id));

    const completedAt = task.completed ? inHours(-2) : null;
    const helperRelation =
      helperIds.length > 0
        ? { set: helperIds.map((id) => ({ id })) }
        : { set: [] };

    const record = await prisma.task.upsert({
      where: { text_userId: { text: task.text, userId: owner.id } },
      update: {
        type: task.type,
        remindAt: task.remindAt ?? null,
        deliverAt: task.deliverAt ?? null,
        options: task.options ?? [],
        completed: task.completed ?? false,
        completedAt,
        helpers: helperRelation,
      },
      create: {
        text: task.text,
        type: task.type,
        userId: owner.id,
        remindAt: task.remindAt ?? null,
        deliverAt: task.deliverAt ?? null,
        options: task.options ?? [],
        completed: task.completed ?? false,
        completedAt,
        helpers: helperIds.length
          ? { connect: helperIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    taskByKey.set(task.key, record);
  }

  const comments = [
    {
      id: "00000000-0000-0000-0000-000000000101",
      taskKey: "advice-focus",
      userEmail: "bri@example.com",
      text: "Try a 25-minute focus sprint and take short breaks.",
    },
    {
      id: "00000000-0000-0000-0000-000000000102",
      taskKey: "decision-dinner",
      userEmail: "alex@example.com",
      text: "Pizza sounds great tonight.",
    },
    {
      id: "00000000-0000-0000-0000-000000000103",
      taskKey: "decision-weekend",
      userEmail: "testuser@example.com",
      text: "Brunch + a walk would be perfect.",
    },
  ];

  await prisma.comment.createMany({
    data: comments.map((comment) => {
      const task = taskByKey.get(comment.taskKey);
      const user = userByEmail.get(comment.userEmail);
      if (!task || !user) {
        throw new Error(`Invalid comment seed: ${comment.id}`);
      }
      return {
        id: comment.id,
        text: comment.text,
        taskId: task.id,
        userId: user.id,
      };
    }),
    skipDuplicates: true,
  });

  await prisma.commentLike.createMany({
    data: [
      {
        commentId: "00000000-0000-0000-0000-000000000101",
        userId: userByEmail.get("testuser@example.com")!.id,
      },
      {
        commentId: "00000000-0000-0000-0000-000000000102",
        userId: userByEmail.get("bri@example.com")!.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.reminderNote.createMany({
    data: [
      {
        id: "00000000-0000-0000-0000-000000000201",
        taskId: taskByKey.get("reminder-groceries")!.id,
        senderId: userByEmail.get("alex@example.com")!.id,
        message: "Want me to pick up anything else?",
      },
      {
        id: "00000000-0000-0000-0000-000000000202",
        taskId: taskByKey.get("reminder-rent")!.id,
        senderId: userByEmail.get("testuser@example.com")!.id,
        message: "Rent day is coming up tomorrow.",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.vote.createMany({
    data: [
      {
        taskId: taskByKey.get("decision-dinner")!.id,
        userId: userByEmail.get("alex@example.com")!.id,
        option: "Pizza",
      },
      {
        taskId: taskByKey.get("decision-dinner")!.id,
        userId: userByEmail.get("bri@example.com")!.id,
        option: "Pasta",
      },
      {
        taskId: taskByKey.get("decision-weekend")!.id,
        userId: userByEmail.get("testuser@example.com")!.id,
        option: "Brunch",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.push.createMany({
    data: [
      {
        taskId: taskByKey.get("motivation-morning")!.id,
        userId: userByEmail.get("bri@example.com")!.id,
      },
      {
        taskId: taskByKey.get("motivation-midweek")!.id,
        userId: userByEmail.get("chris@example.com")!.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.follow.createMany({
    data: [
      {
        followerId: userByEmail.get("alex@example.com")!.id,
        followingId: userByEmail.get("testuser@example.com")!.id,
      },
      {
        followerId: userByEmail.get("bri@example.com")!.id,
        followingId: userByEmail.get("alex@example.com")!.id,
      },
      {
        followerId: userByEmail.get("chris@example.com")!.id,
        followingId: userByEmail.get("testuser@example.com")!.id,
      },
    ],
    skipDuplicates: true,
  });

  for (const user of userByEmail.values()) {
    await prisma.featureFlags.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        motivation: true,
        advice: true,
        decision: true,
        reminder: true,
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        id: "00000000-0000-0000-0000-000000000301",
        userId: userByEmail.get("testuser@example.com")!.id,
        senderId: userByEmail.get("alex@example.com")!.id,
        type: "comment",
        taskType: "advice",
        message: "Alex commented on your task.",
        metadata: { taskId: taskByKey.get("advice-focus")!.id },
      },
      {
        id: "00000000-0000-0000-0000-000000000302",
        userId: userByEmail.get("bri@example.com")!.id,
        senderId: userByEmail.get("testuser@example.com")!.id,
        type: "vote",
        taskType: "decision",
        message: "You received a new vote.",
        metadata: { taskId: taskByKey.get("decision-dinner")!.id },
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed data populated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
