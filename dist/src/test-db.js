"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config"); // simpler and loads immediately
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function testConnection() {
    try {
        console.log('⏳ Testing DB connection...');
        const now = await prisma.$queryRaw `SELECT NOW()`;
        console.log('✅ DB connected. Server time:', now);
    }
    catch (err) {
        console.error('❌ DB connection failed:', err);
    }
    finally {
        await prisma.$disconnect();
    }
}
testConnection();
