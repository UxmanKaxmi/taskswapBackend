/*
  Warnings:

  - A unique constraint covering the columns `[text,userId]` on the table `Task` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Task_text_userId_key" ON "Task"("text", "userId");
