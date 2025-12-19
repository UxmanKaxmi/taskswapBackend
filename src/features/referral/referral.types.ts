// src/features/referral/referral.types.ts

export type Channel = "GENERIC" | "SMS" | "WHATSAPP" | "EMAIL";

export interface ReferralStats {
  totalInvites: number;
  joined: number;
  rewardsEarned: number;
  pendingRewards: number;
}

export interface ReferralLinkResponse {
  link: string;
  refCode: string;
  stats: ReferralStats;
  share: {
    message: string;
    title: string;
  };
}

export interface AttributeReferralPayload {
  ref: string;
  channel?: Channel;
  src?: string;
  c?: string;
  installId?: string;
  k?: string;
}
