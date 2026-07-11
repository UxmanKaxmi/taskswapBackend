// First-time hints ("beats" in the product spec): one-time inline teaching
// moments. Named "hints" on the wire because "beat" already means a task's
// post/update content unit (TaskBeat) and /beats is the cheer route prefix.
export const FIRST_TIME_HINT_IDS = [
  "first_goal_posted",
  "first_push_given",
  "cheer_discovery",
  "first_response",
] as const;

export type FirstTimeHintId = (typeof FIRST_TIME_HINT_IDS)[number];

// "pending" is implicit: an id absent from the map has never been completed
// or dismissed.
export type FirstTimeHintState = "completed" | "dismissed";

export interface FirstTimeHintEntry {
  state: FirstTimeHintState;
  at: string;
  // Set by the rollout backfill migration so funnels can exclude entries
  // that were seeded from historical activity rather than earned live.
  seeded?: boolean;
}

export type FirstTimeHintMap = Partial<
  Record<FirstTimeHintId, FirstTimeHintEntry>
>;

export const isFirstTimeHintId = (value: string): value is FirstTimeHintId =>
  (FIRST_TIME_HINT_IDS as readonly string[]).includes(value);

export const isFirstTimeHintState = (
  value: unknown
): value is FirstTimeHintState =>
  value === "completed" || value === "dismissed";
