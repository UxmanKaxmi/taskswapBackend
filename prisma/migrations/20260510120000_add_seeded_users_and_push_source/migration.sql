-- Add internal origin/profile fields for seeded launch users.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarInitial" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarColor" TEXT;
ALTER TABLE "User" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'real';

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_origin_idx" ON "User"("origin");

-- Track internally generated push activity without exposing it in public APIs.
ALTER TABLE "Push" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'real';
ALTER TABLE "Push" ADD COLUMN "message" TEXT;

CREATE INDEX "Push_source_taskId_idx" ON "Push"("source", "taskId");
