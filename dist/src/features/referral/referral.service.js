"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateReferralCode = getOrCreateReferralCode;
exports.getActiveLink = getActiveLink;
exports.upsertReferralLink = upsertReferralLink;
exports.rotateReferralLinks = rotateReferralLinks;
exports.getReferralStats = getReferralStats;
exports.getReferralLink = getReferralLink;
exports.rotateReferralLink = rotateReferralLink;
exports.attributeReferral = attributeReferral;
// src/features/referral/referral.service.ts
const client_1 = require("../../db/client");
const uuid_1 = require("uuid");
const client_2 = require("@prisma/client");
const fdl_1 = require("../../utils/fdl");
const APP_WEB_ORIGIN = "https://PushMeUp.app";
async function getOrCreateReferralCode(userId) {
    const existing = await client_1.prisma.referralCode.findUnique({ where: { userId } });
    if (existing)
        return existing;
    const code = `USER${Math.floor(1000 + Math.random() * 9000)}`;
    return client_1.prisma.referralCode.create({ data: { userId, code } });
}
async function getActiveLink(userId, channel = "GENERIC") {
    return client_1.prisma.referralLink.findUnique({
        where: {
            userId_channel: { userId, channel: channel },
        },
    });
}
async function upsertReferralLink(userId, channel = "GENERIC") {
    const token = (0, uuid_1.v4)(); // ✅ uuid token
    return client_1.prisma.referralLink.upsert({
        where: {
            userId_channel: { userId, channel: channel },
        },
        update: { token, active: true },
        create: { userId, channel: channel, token },
    });
}
async function rotateReferralLinks(userId) {
    const links = await client_1.prisma.referralLink.findMany({ where: { userId } });
    if (!links.length) {
        await upsertReferralLink(userId, "GENERIC");
        return client_1.prisma.referralLink.findMany({ where: { userId } });
    }
    await Promise.all(links.map((l) => client_1.prisma.referralLink.update({
        where: { id: l.id },
        data: { token: (0, uuid_1.v4)(), active: true }, // ✅ uuid token
    })));
    return client_1.prisma.referralLink.findMany({ where: { userId } });
}
async function getReferralStats(userId) {
    const totalInvites = await client_1.prisma.referral.count({
        where: { inviterId: userId },
    });
    const joined = await client_1.prisma.referral.count({
        where: { inviterId: userId, inviteeId: { not: null } },
    });
    return { totalInvites, joined, rewardsEarned: 0, pendingRewards: 0 };
}
async function getReferralLink(userId, channel = "GENERIC") {
    const code = await getOrCreateReferralCode(userId);
    const linkRow = (await getActiveLink(userId, channel)) ||
        (await upsertReferralLink(userId, channel));
    const url = new URL("/invite", APP_WEB_ORIGIN);
    // URLSearchParams handles encoding; pass raw values
    url.searchParams.set("ref", code.code);
    url.searchParams.set("k", linkRow.token);
    url.searchParams.set("channel", channel);
    const stats = await getReferralStats(userId);
    const long = url.toString();
    const short = await (0, fdl_1.shortenWithFDL)(long);
    return {
        link: short, // <-- return the short page.link
        refCode: code.code,
        stats,
        share: {
            message: "Join me on Push Me Up — manage and share your tasks easily!",
            title: "Invite to Push Me Up",
        },
    };
}
async function rotateReferralLink(userId) {
    await rotateReferralLinks(userId);
    return getReferralLink(userId);
}
async function attributeReferral(payload) {
    const rc = await client_1.prisma.referralCode.findUnique({
        where: { code: payload.ref },
    });
    if (!rc)
        return null;
    // Validate rotating token if provided
    if (payload.k) {
        const valid = await client_1.prisma.referralLink.findFirst({
            where: { userId: rc.userId, token: payload.k, active: true },
        });
        if (!valid)
            return null;
    }
    return client_1.prisma.referral.create({
        data: {
            inviterId: rc.userId,
            codeUsed: payload.ref,
            channel: (payload.channel ?? "GENERIC"),
            src: payload.src,
            campaign: payload.c,
            installId: payload.installId,
            status: client_2.$Enums.ReferralStatus.PENDING,
        },
    });
}
