import { prisma } from "../../db/client";
import {
  DEFAULT_FEATURE_FLAGS,
  FeatureFlagsDTO,
  FeatureFlagsResponse,
} from "./featureFlags.types";

const toDTO = (row: FeatureFlagsDTO): FeatureFlagsDTO => ({
  motivation: row.motivation,
  advice: row.advice,
  decision: row.decision,
  reminder: row.reminder,
});

export async function getFeatureFlagsForUser(
  userId: string
): Promise<FeatureFlagsResponse> {
  const existing = await prisma.featureFlags.findUnique({
    where: { userId },
  });

  const record =
    existing ?? 
    (await prisma.featureFlags.create({
      data: { userId, ...DEFAULT_FEATURE_FLAGS },
    }));

  return { features: toDTO(record) };
}

export async function updateFeatureFlagsForUser(
  userId: string,
  updates: Partial<FeatureFlagsDTO>
): Promise<FeatureFlagsResponse> {
  const record = await prisma.featureFlags.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_FEATURE_FLAGS, ...updates },
    update: updates,
  });

  return { features: toDTO(record) };
}
