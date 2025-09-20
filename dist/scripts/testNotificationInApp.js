"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("db/client");
const notification_service_1 = require("features/notification/notification.service");
async function run() {
    const yourUserId = '116927400509111867348'; // 🔁 replace with your actual user ID
    await (0, notification_service_1.sendTestDecisionDoneNotification)(yourUserId);
    await client_1.prisma.$disconnect();
}
run();
