-- CreateEnum
CREATE TYPE "TaskBeatType" AS ENUM ('post', 'update');

-- CreateTable
CREATE TABLE "TaskBeat" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "TaskBeatType" NOT NULL,
    "updateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cheer" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "presetTextSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cheer_pkey" PRIMARY KEY ("id")
);

-- Backfill post beats for existing tasks.
INSERT INTO "TaskBeat" ("id", "taskId", "type", "createdAt")
SELECT "id", "id", 'post'::"TaskBeatType", "createdAt"
FROM "Task";

-- Backfill update beats for existing progress updates.
INSERT INTO "TaskBeat" ("id", "taskId", "type", "updateId", "createdAt")
SELECT "id", "taskId", 'update'::"TaskBeatType", "id", "createdAt"
FROM "ProgressUpdate";

-- CreateIndex
CREATE UNIQUE INDEX "TaskBeat_updateId_key" ON "TaskBeat"("updateId");

-- CreateIndex
CREATE INDEX "TaskBeat_taskId_createdAt_idx" ON "TaskBeat"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskBeat_updateId_idx" ON "TaskBeat"("updateId");

-- CreateIndex
CREATE UNIQUE INDEX "Cheer_beatId_userId_key" ON "Cheer"("beatId", "userId");

-- CreateIndex
CREATE INDEX "Cheer_taskId_createdAt_idx" ON "Cheer"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Cheer_userId_createdAt_idx" ON "Cheer"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Push_taskId_userId_key" ON "Push"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "TaskBeat" ADD CONSTRAINT "TaskBeat_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBeat" ADD CONSTRAINT "TaskBeat_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "ProgressUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheer" ADD CONSTRAINT "Cheer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheer" ADD CONSTRAINT "Cheer_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "TaskBeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheer" ADD CONSTRAINT "Cheer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
