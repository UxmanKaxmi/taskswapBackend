import "../src/config/env";
import { prisma } from "../src/db/client";
import { seedSeededUsers } from "../src/features/seededUser/seededUser.service";

async function main() {
  const result = await seedSeededUsers(prisma);
  console.log(`Seeded users ready: ${result.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
