// Global, server-controlled flags merged into every GET /features response.
// Unlike the per-user FeatureFlags row (user-editable goal-type preferences),
// these are kill switches: env-var driven so they can be flipped for everyone
// without a client release, and deliberately excluded from PATCH /features.
const envFlag = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
};

export interface GlobalFeatureFlagsDTO {
  firstTimeBeats: boolean;
  hintFirstGoalPosted: boolean;
  hintFirstPushGiven: boolean;
  hintCheerDiscovery: boolean;
  hintFirstResponse: boolean;
}

// The master flag ships dark (default false) and is turned on via env.
// Per-hint flags default on; they only matter while the master is on and
// exist so a single misbehaving hint can be pulled without a release.
export function getGlobalFeatureFlags(): GlobalFeatureFlagsDTO {
  return {
    firstTimeBeats: envFlag("FLAG_FIRST_TIME_BEATS", false),
    hintFirstGoalPosted: envFlag("FLAG_HINT_FIRST_GOAL_POSTED", true),
    hintFirstPushGiven: envFlag("FLAG_HINT_FIRST_PUSH_GIVEN", true),
    hintCheerDiscovery: envFlag("FLAG_HINT_CHEER_DISCOVERY", true),
    hintFirstResponse: envFlag("FLAG_HINT_FIRST_RESPONSE", true),
  };
}
