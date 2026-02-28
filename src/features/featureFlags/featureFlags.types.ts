export const FEATURE_FLAG_KEYS = [
  "motivation",
  "advice",
  "decision",
  "reminder",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export interface FeatureFlagsDTO {
  motivation: boolean;
  advice: boolean;
  decision: boolean;
  reminder: boolean;
}

export interface FeatureFlagsResponse {
  features: FeatureFlagsDTO;
}

export interface FeatureFlagsUpdateBody {
  features: Partial<Record<FeatureFlagKey, boolean>>;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsDTO = {
  motivation: true,
  advice: true,
  decision: true,
  reminder: true,
};

export const isFeatureFlagKey = (value: string): value is FeatureFlagKey =>
  (FEATURE_FLAG_KEYS as readonly string[]).includes(value);
