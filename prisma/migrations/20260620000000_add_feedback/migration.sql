-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('confusing', 'bug', 'idea', 'positive', 'other');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "category" "FeedbackCategory",
    "message" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "device" TEXT,
    "osVersion" TEXT,
    "currentScreen" TEXT,
    "userId" TEXT,
    "timeSubmitted" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
