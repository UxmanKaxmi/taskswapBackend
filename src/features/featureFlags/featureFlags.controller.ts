import { RequestHandler } from "express";
import * as svc from "./featureFlags.service";
import {
  DEFAULT_FEATURE_FLAGS,
  FeatureFlagsDTO,
  FeatureFlagsUpdateBody,
  isFeatureFlagKey,
} from "./featureFlags.types";
import { getGlobalFeatureFlags } from "./globalFlags";

export const handleGetFeatureFlags: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(200).json({
        features: { ...DEFAULT_FEATURE_FLAGS, ...getGlobalFeatureFlags() },
      });
      return;
    }

    const data = await svc.getFeatureFlagsForUser(userId);
    res.status(200).json({
      features: { ...data.features, ...getGlobalFeatureFlags() },
    });
  } catch (err) {
    next(err);
  }
};

export const handleUpdateFeatureFlags: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body as FeatureFlagsUpdateBody;
    const features = body?.features;

    if (!features || typeof features !== "object" || Array.isArray(features)) {
      res.status(400).json({ error: "Missing features object" });
      return;
    }

    const updates: Partial<FeatureFlagsDTO> = {};

    for (const [key, value] of Object.entries(features)) {
      if (!isFeatureFlagKey(key)) {
        res.status(400).json({ error: `Unknown feature: ${key}` });
        return;
      }

      if (typeof value !== "boolean") {
        res
          .status(400)
          .json({ error: `Feature '${key}' must be boolean` });
        return;
      }

      updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid feature updates provided" });
      return;
    }

    const data = await svc.updateFeatureFlagsForUser(userId, updates);
    res.status(200).json({
      features: { ...data.features, ...getGlobalFeatureFlags() },
    });
  } catch (err) {
    next(err);
  }
};
