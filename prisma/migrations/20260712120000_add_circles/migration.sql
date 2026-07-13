-- Circles: a shared frame around individual member tasks. Each member keeps
-- their OWN Task row carrying the shared sentence; the circle is a lens over
-- N solo tasks, never a new task type.

-- CreateEnum
CREATE TYPE "CircleStatus" AS ENUM ('active', 'complete', 'dissolved');

-- CreateEnum
CREATE TYPE "CircleMemberState" AS ENUM ('active', 'left', 'done');

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "goalText" TEXT NOT NULL,
    "status" "CircleStatus" NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "dissolvedAt" TIMESTAMP(3),

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleInvite" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CircleInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleMember" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "inviteId" TEXT,
    "state" "CircleMemberState" NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "CircleMember_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "circleId" TEXT;

-- CreateIndex
CREATE INDEX "Circle_status_createdAt_idx" ON "Circle"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CircleInvite_token_key" ON "CircleInvite"("token");

-- CreateIndex
CREATE INDEX "CircleInvite_circleId_expiresAt_idx" ON "CircleInvite"("circleId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CircleMember_taskId_key" ON "CircleMember"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleMember_circleId_userId_key" ON "CircleMember"("circleId", "userId");

-- CreateIndex
CREATE INDEX "CircleMember_userId_state_idx" ON "CircleMember"("userId", "state");

-- CreateIndex
CREATE INDEX "Task_circleId_idx" ON "Task"("circleId");

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvite" ADD CONSTRAINT "CircleInvite_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvite" ADD CONSTRAINT "CircleInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleMember" ADD CONSTRAINT "CircleMember_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "CircleInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Shared sentences: members of one circle all carry the same text, so the
-- text+user uniqueness now only guards solo tasks. Same partial-index
-- technique as one_active_anon_task_per_user (Prisma can't express it).
DROP INDEX "Task_text_userId_key";
CREATE UNIQUE INDEX "Task_text_userId_key" ON "Task"("text", "userId") WHERE "circleId" IS NULL;
