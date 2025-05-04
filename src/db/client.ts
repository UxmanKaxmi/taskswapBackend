import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Dynamically load the appropriate .env file
const envPath =
  process.env.NODE_ENV === 'production'
    ? resolve(__dirname, '../../.env.production')
    : resolve(__dirname, '../../.env');

dotenv.config({ path: envPath });

console.log('Connected to DB:', process.env.DATABASE_URL);

export const prisma = new PrismaClient();