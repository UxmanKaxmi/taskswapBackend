-- Per-user first-time hint state ("first-time beats" in the product spec).
-- Shape: { "<hintId>": { "state": "completed"|"dismissed", "at": iso, "seeded"?: true } }
-- An absent id means pending.
ALTER TABLE "User" ADD COLUMN "firstTimeHints" JSONB NOT NULL DEFAULT '{}';

-- Backfill from historical activity so veterans never see a hint for an
-- action they have already performed. Entries are marked seeded so funnels
-- can exclude them from live completion metrics.
UPDATE "User" u
SET "firstTimeHints" = "firstTimeHints" || jsonb_build_object(
  'first_push_given',
  jsonb_build_object('state', 'completed', 'at', to_jsonb(now()), 'seeded', true)
)
WHERE EXISTS (SELECT 1 FROM "Push" p WHERE p."userId" = u."id");

UPDATE "User" u
SET "firstTimeHints" = "firstTimeHints" || jsonb_build_object(
  'cheer_discovery',
  jsonb_build_object('state', 'completed', 'at', to_jsonb(now()), 'seeded', true)
)
WHERE EXISTS (SELECT 1 FROM "Cheer" c WHERE c."userId" = u."id");

UPDATE "User" u
SET "firstTimeHints" = "firstTimeHints" || jsonb_build_object(
  'first_response',
  jsonb_build_object('state', 'completed', 'at', to_jsonb(now()), 'seeded', true)
)
WHERE EXISTS (SELECT 1 FROM "ProgressUpdate" pu WHERE pu."senderId" = u."id");
