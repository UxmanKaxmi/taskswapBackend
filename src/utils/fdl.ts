// src/utils/fdl.ts
import axios from "axios";

const FDL = process.env.FDL_DOMAIN_URI_PREFIX!;
const KEY = process.env.FDL_API_KEY!;

export async function shortenWithFDL(longUrl: string) {
  if (!FDL || !KEY) return longUrl; // no-op if not configured
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
    suffix: { option: "SHORT" as const },
  };
  try {
    const { data } = await axios.post(
      `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${KEY}`,
      payload
    );
    return data.shortLink as string;
  } catch (e) {
    console.warn(
      "[FDL] shorten failed, falling back to long URL:",
      (e as any)?.response?.data || e
    );
    return longUrl;
  }
}
