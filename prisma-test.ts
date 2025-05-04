import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create a test task
  const newTask = await prisma.task.create({
    data: {
      text: 'Test task from script',
      type: 'reminder',
    },
  });

  console.log('Created task:', newTask);

  // Fetch all tasks
  const allTasks = await prisma.task.findMany();
  console.log('All tasks:', allTasks);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());