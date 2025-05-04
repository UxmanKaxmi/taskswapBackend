import 'dotenv/config'; // simpler and loads immediately
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('⏳ Testing DB connection...');
    const now = await prisma.$queryRaw`SELECT NOW()`;
    console.log('✅ DB connected. Server time:', now);
  } catch (err) {
    console.error('❌ DB connection failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();