// prisma/seed.ts
//
// Seeds a set of users with real names + portrait photos (reusing the seeded-user
// profile source) and gives each one a single MOTIVATION task, plus a light
// social graph (follows + pushes) so the feed looks alive.
//
// Run with: npm run seed:AddUsers
import { Task, User } from "@prisma/client";
import { prisma } from "../src/db/client";
import {
  USER_ORIGIN,
  getSeededUserProfiles,
} from "../src/features/seededUser/seededUser.service";

const SEED_USER_COUNT = 12;

// Realistic motivation goals — one per seeded user (cycled if there are more users).
const MOTIVATION_GOALS = [

  "Finish the first draft of my novel instead of avoiding it again",
 "Go back to the gym after falling out of the habit for months",
 "Launch the side project I keep talking about but never ship",
 "Run my first 5k without stopping even when it starts hurting",
 "Study for finals tonight instead of convincing myself I have time",
 "Stop ordering late-night food whenever I feel stressed or bored",
 "Wake up early this week without hitting snooze five times",
 "Apply to five jobs even though I am scared of getting rejected",
 "Meditate every morning instead of reaching for my phone first",
 "Read a full book this week instead of scrolling every night",
 "Ship the portfolio website I have been avoiding for months",
"Practice guitar every day instead of saying I will start tomorrow",
"Start saving money instead of spending everything without thinking",
"Take a proper walk every day even when I do not feel like it",

];

const FEELINGS = [
  "stuck",
  "nervous",
  "tired",
  "avoiding_it",
  "overwhelmed",
  "almost_there",
] as const;

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

async function main() {
  console.log("Seeding motivation users + tasks...");

  const profiles = (await getSeededUserProfiles()).slice(0, SEED_USER_COUNT);

  // 1) Users — real names/photos, marked as seeded so the reminder sweep skips them.
  const users: User[] = [];
  for (const profile of profiles) {
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: {
        name: profile.name,
        photo: profile.photo,
        username: profile.username,
        avatarInitial: profile.avatarInitial,
        avatarColor: profile.avatarColor,
        origin: USER_ORIGIN.SEEDED,
      },
      create: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        photo: profile.photo,
        username: profile.username,
        avatarInitial: profile.avatarInitial,
        avatarColor: profile.avatarColor,
        origin: USER_ORIGIN.SEEDED,
      },
    });
    users.push(user);
  }

  // 2) One motivation task per user.
  const tasks: Task[] = [];
  for (let index = 0; index < users.length; index += 1) {
    const owner = users[index];
    const text = MOTIVATION_GOALS[index % MOTIVATION_GOALS.length];

    const task = await prisma.task.upsert({
      where: { text_userId: { text, userId: owner.id } },
      update: { name: owner.name, avatar: owner.photo ?? "" },
      create: {
        text,
        type: "motivation",
        userId: owner.id,
        name: owner.name,
        avatar: owner.photo ?? "",
        feeling: FEELINGS[index % FEELINGS.length],
        isPublic: true,
        createdAt: hoursAgo((index + 1) * 3),
      },
    });
    tasks.push(task);
  }

  // 3) Light social graph — everyone follows the next two users (circular).
  const total = users.length;
  if (total > 1) {
    const follows = users.flatMap((follower, index) =>
      [1, 2]
        .map((offset) => users[(index + offset) % total])
        .filter((following) => following.id !== follower.id)
        .map((following) => ({
          followerId: follower.id,
          followingId: following.id,
        }))
    );

    await prisma.follow.createMany({ data: follows, skipDuplicates: true });

    // 4) A couple of pushes per task from other users, with matching pushCount.
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const pushers = [1, 2]
        .map((offset) => users[(index + offset) % total])
        .filter((pusher) => pusher.id !== task.userId);

      if (!pushers.length) continue;

      await prisma.push.createMany({
        data: pushers.map((pusher) => ({ userId: pusher.id, taskId: task.id })),
        skipDuplicates: true,
      });

      const pushCount = await prisma.push.count({ where: { taskId: task.id } });
      await prisma.task.update({
        where: { id: task.id },
        data: { pushCount },
      });
    }
  }

  // 5) Default feature flags for each seeded user.
  for (const user of users) {
    await prisma.featureFlags.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }

  console.log(
    `Seed complete: ${users.length} users, ${tasks.length} motivation tasks.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
