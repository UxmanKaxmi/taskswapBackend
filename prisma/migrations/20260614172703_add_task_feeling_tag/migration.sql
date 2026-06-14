-- CreateEnum
CREATE TYPE "FeelingTag" AS ENUM ('stuck', 'nervous', 'tired', 'avoiding_it', 'overwhelmed', 'almost_there');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "feeling" "FeelingTag";
