CREATE TYPE "ReportStatus" AS ENUM ('pending', 'reviewed', 'dismissed', 'action_taken');

CREATE TABLE "TaskReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "TaskReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskReport_status_createdAt_idx" ON "TaskReport"("status", "createdAt");
CREATE INDEX "TaskReport_reporterId_createdAt_idx" ON "TaskReport"("reporterId", "createdAt");
CREATE INDEX "TaskReport_taskId_createdAt_idx" ON "TaskReport"("taskId", "createdAt");
CREATE INDEX "TaskReport_reportedUserId_createdAt_idx" ON "TaskReport"("reportedUserId", "createdAt");

CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

ALTER TABLE "TaskReport" ADD CONSTRAINT "TaskReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReport" ADD CONSTRAINT "TaskReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReport" ADD CONSTRAINT "TaskReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
