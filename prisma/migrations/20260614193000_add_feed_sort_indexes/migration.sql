ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "pushCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "latestActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "isAlmostThere" BOOLEAN NOT NULL DEFAULT false;

WITH push_stats AS (
  SELECT
    p."taskId",
    COUNT(*)::int AS push_count,
    MAX(p."createdAt") AS latest_push_at
  FROM "Push" p
  GROUP BY p."taskId"
)
UPDATE "Task" t
SET
  "pushCount" = COALESCE(push_stats.push_count, 0),
  "latestActivityAt" = GREATEST(t."createdAt", COALESCE(push_stats.latest_push_at, t."createdAt")),
  "isAlmostThere" = COALESCE(push_stats.push_count, 0) >= 3
FROM push_stats
WHERE t.id = push_stats."taskId";

UPDATE "Task" t
SET
  "pushCount" = 0,
  "latestActivityAt" = t."createdAt",
  "isAlmostThere" = false
WHERE NOT EXISTS (
  SELECT 1
  FROM "Push" p
  WHERE p."taskId" = t.id
);

CREATE INDEX IF NOT EXISTS "Task_feed_new_idx"
  ON "Task" ("createdAt" DESC, id DESC)
  WHERE "isPublic" = true
    AND type = 'motivation'
    AND completed = false
    AND "completedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Task_feed_needs_push_idx"
  ON "Task" ("pushCount" ASC, "createdAt" DESC, id DESC)
  WHERE "isPublic" = true
    AND type = 'motivation'
    AND completed = false
    AND "completedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Task_feed_almost_there_idx"
  ON "Task" ("latestActivityAt" DESC, id DESC)
  WHERE "isPublic" = true
    AND type = 'motivation'
    AND completed = false
    AND "completedAt" IS NULL
    AND "isAlmostThere" = true;

CREATE INDEX IF NOT EXISTS "Push_taskId_createdAt_idx"
  ON "Push" ("taskId", "createdAt" DESC);
