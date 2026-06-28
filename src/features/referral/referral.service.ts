// src/features/referral/referral.service.ts
import { prisma } from "../../db/client";
import { getReferralShareText } from "../../utils/notificationTextCatalog";
import { v4 as uuidv4 } from "uuid";
import { $Enums } from "@prisma/client";
import {
  Channel,
  ReferralLinkResponse,
  AttributeReferralPayload,
} from "./referral.types";
import { shortenWithFDL } from "../../utils/fdl";

const APP_WEB_ORIGIN =  "https://PushMeUp.app";

export async function getOrCreateReferralCode(userId: string) {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) return existing;

  const code = `USER${Math.floor(1000 + Math.random() * 9000)}`;
  return prisma.referralCode.create({ data: { userId, code } });
}

export async function getActiveLink(
  userId: string,
  channel: Channel = "GENERIC"
) {
  return prisma.referralLink.findUnique({
    where: {
      userId_channel: { userId, channel: channel as $Enums.ReferralChannel },
    },
  });
}

export async function upsertReferralLink(
  userId: string,
  channel: Channel = "GENERIC"
) {
  const token = uuidv4(); // ✅ uuid token
  return prisma.referralLink.upsert({
    where: {
      userId_channel: { userId, channel: channel as $Enums.ReferralChannel },
    },
    update: { token, active: true },
    create: { userId, channel: channel as $Enums.ReferralChannel, token },
  });
}

export async function rotateReferralLinks(userId: string) {
  const links = await prisma.referralLink.findMany({ where: { userId } });
  if (!links.length) {
    await upsertReferralLink(userId, "GENERIC");
    return prisma.referralLink.findMany({ where: { userId } });
  }
  await Promise.all(
    links.map((l) =>
      prisma.referralLink.update({
        where: { id: l.id },
        data: { token: uuidv4(), active: true }, // ✅ uuid token
      })
    )
  );
  return prisma.referralLink.findMany({ where: { userId } });
}

export async function getReferralStats(userId: string) {
  const totalInvites = await prisma.referral.count({
    where: { inviterId: userId },
  });
  const joined = await prisma.referral.count({
    where: { inviterId: userId, inviteeId: { not: null } },
  });
  return { totalInvites, joined, rewardsEarned: 0, pendingRewards: 0 };
}

export async function getReferralLink(
  userId: string,
  channel: Channel = "GENERIC"
): Promise<ReferralLinkResponse> {
  const code = await getOrCreateReferralCode(userId);
  const linkRow =
    (await getActiveLink(userId, channel)) ||
    (await upsertReferralLink(userId, channel));

  const url = new URL("/invite", APP_WEB_ORIGIN);
  // URLSearchParams handles encoding; pass raw values
  url.searchParams.set("ref", code.code);
  url.searchParams.set("k", linkRow.token);
  url.searchParams.set("channel", channel);

  const stats = await getReferralStats(userId);
  const long = url.toString();
  const short = await shortenWithFDL(long);

  return {
    link: short, // <-- return the short page.link
    refCode: code.code,
    stats,
    share: getReferralShareText(),
  };
}

export async function rotateReferralLink(userId: string) {
  await rotateReferralLinks(userId);
  return getReferralLink(userId);
}

export async function attributeReferral(payload: AttributeReferralPayload) {
  const rc = await prisma.referralCode.findUnique({
    where: { code: payload.ref },
  });
  if (!rc) return null;

  // Validate rotating token if provided
  if (payload.k) {
    const valid = await prisma.referralLink.findFirst({
      where: { userId: rc.userId, token: payload.k, active: true },
    });
    if (!valid) return null;
  }

  return prisma.referral.create({
    data: {
      inviterId: rc.userId,
      codeUsed: payload.ref,
      channel: (payload.channel ?? "GENERIC") as $Enums.ReferralChannel,
      src: payload.src,
      campaign: payload.c,
      installId: payload.installId,
      status: $Enums.ReferralStatus.PENDING,
    },
  });
}
