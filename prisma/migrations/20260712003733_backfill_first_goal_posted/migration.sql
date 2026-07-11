-- New first-time hint id: first_goal_posted (the "+" / add-goal spotlight).
-- Backfill anyone who has ever created a task so veterans never see it.
UPDATE "User" u
SET "firstTimeHints" = "firstTimeHints" || jsonb_build_object(
  'first_goal_posted',
  jsonb_build_object('state', 'completed', 'at', to_jsonb(now()), 'seeded', true)
)
WHERE NOT ("firstTimeHints" ? 'first_goal_posted')
  AND EXISTS (SELECT 1 FROM "Task" t WHERE t."userId" = u."id");
