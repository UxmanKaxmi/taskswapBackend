"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortenWithFDL = shortenWithFDL;
// src/utils/fdl.ts
const axios_1 = __importDefault(require("axios"));
const FDL = process.env.FDL_DOMAIN_URI_PREFIX;
const KEY = process.env.FDL_API_KEY;
async function shortenWithFDL(longUrl) {
    if (!FDL || !KEY)
        return longUrl; // no-op if not configured
    const payload = {
        dynamicLinkInfo: {
            domainUriPrefix: FDL,
            link: longUrl,
            androidInfo: { androidPackageName: process.env.ANDROID_PACKAGE },
            iosInfo: {
                iosBundleId: process.env.IOS_BUNDLE_ID,
                iosAppStoreId: process.env.IOS_APP_STORE_ID,
            },
        },
        suffix: { option: "SHORT" },
    };
    try {
        const { data } = await axios_1.default.post(`https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${KEY}`, payload);
        return data.shortLink;
    }
    catch (e) {
        console.warn("[FDL] shorten failed, falling back to long URL:", e?.response?.data || e);
        return longUrl;
    }
}
