-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deliverAt" TIMESTAMP(3),
ADD COLUMN     "options" TEXT[],
ADD COLUMN     "remindAt" TIMESTAMP(3);
