// src/features/referral/referral.controller.ts
import { RequestHandler } from "express";
import * as svc from "./referral.service";
import { AttributeReferralPayload, Channel } from "./referral.types";

const toChannel = (v: any): Channel => {
  const up = (v ?? "").toString().toUpperCase();
  return (["GENERIC", "SMS", "WHATSAPP", "EMAIL"] as const).includes(
    up as Channel
  )
    ? (up as Channel)
    : "GENERIC";
};

// GET /api/referrals/link?channel=sms|whatsapp|email
export const getReferralLink: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const channel = toChannel(req.query.channel);
    const data = await svc.getReferralLink(userId, channel);
    res.status(200).json(data);
    return;
  } catch (err) {
    next(err);
  }
};

// POST /api/referrals/link/rotate
export const rotateReferralLink: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const data = await svc.rotateReferralLink(userId);
    res.status(200).json(data);
    return;
  } catch (err) {
    next(err);
  }
};

// POST /api/referrals/attribute  (public)
export const attributeReferral: RequestHandler = async (req, res, next) => {
  try {
    const payload = req.body as AttributeReferralPayload;
    if (!payload?.ref) {
      res.status(400).json({ error: "Missing ref" });
      return;
    }
    if (payload.channel) payload.channel = toChannel(payload.channel);

    const created = await svc.attributeReferral(payload);
    if (!created) {
      res.status(404).json({ error: "Invalid referral (code or token)" });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  } catch (err) {
    next(err);
  }
};
