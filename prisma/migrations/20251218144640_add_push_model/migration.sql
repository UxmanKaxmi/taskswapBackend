-- CreateTable
CREATE TABLE "Push" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Push_taskId_idx" ON "Push"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Push_userId_taskId_key" ON "Push"("userId", "taskId");

-- AddForeignKey
ALTER TABLE "Push" ADD CONSTRAINT "Push_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Push" ADD CONSTRAINT "Push_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
