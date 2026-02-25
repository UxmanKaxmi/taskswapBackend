"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.attributeReferral = exports.rotateReferralLink = exports.getReferralLink = void 0;
const svc = __importStar(require("./referral.service"));
const toChannel = (v) => {
    const up = (v ?? "").toString().toUpperCase();
    return ["GENERIC", "SMS", "WHATSAPP", "EMAIL"].includes(up)
        ? up
        : "GENERIC";
};
// GET /api/referrals/link?channel=sms|whatsapp|email
const getReferralLink = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const channel = toChannel(req.query.channel);
        const data = await svc.getReferralLink(userId, channel);
        res.status(200).json(data);
        return;
    }
    catch (err) {
        next(err);
    }
};
exports.getReferralLink = getReferralLink;
// POST /api/referrals/link/rotate
const rotateReferralLink = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const data = await svc.rotateReferralLink(userId);
        res.status(200).json(data);
        return;
    }
    catch (err) {
        next(err);
    }
};
exports.rotateReferralLink = rotateReferralLink;
// POST /api/referrals/attribute  (public)
const attributeReferral = async (req, res, next) => {
    try {
        const payload = req.body;
        if (!payload?.ref) {
            res.status(400).json({ error: "Missing ref" });
            return;
        }
        if (payload.channel)
            payload.channel = toChannel(payload.channel);
        const created = await svc.attributeReferral(payload);
        if (!created) {
            res.status(404).json({ error: "Invalid referral (code or token)" });
            return;
        }
        res.status(200).json({ ok: true });
        return;
    }
    catch (err) {
        next(err);
    }
};
exports.attributeReferral = attributeReferral;
