import { prisma } from "db/client";
import { sendTestDecisionDoneNotification } from "features/notification/notification.service";

async function run() {
    const yourUserId = '116927400509111867348'; // 🔁 replace with your actual user ID
    await sendTestDecisionDoneNotification(yourUserId);
    await prisma.$disconnect();
}

run();