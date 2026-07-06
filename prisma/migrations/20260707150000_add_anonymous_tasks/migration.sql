-- Anonymous tasks: per-task alias identity, poster hidden, supporters named
ALTER TABLE "Task" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "anonAlias" TEXT;
ALTER TABLE "Task" ADD COLUMN "anonAvatarColor" TEXT;

-- One ACTIVE anonymous task per user, enforced at the DB level.
CREATE UNIQUE INDEX "one_active_anon_task_per_user"
ON "Task" ("userId") WHERE "isAnonymous" = true AND "completed" = false;
