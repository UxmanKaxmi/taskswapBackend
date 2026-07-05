import { OAuth2Client } from "google-auth-library";
import { Request, Response, NextFunction } from "express";
import crypto, { JsonWebKey } from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";

const client = new OAuth2Client();
const GOOGLE_AUDIENCE =
  "424884151196-8b2midonidm3m1u77konerbc6its5knv.apps.googleusercontent.com";
const APPLE_AUDIENCE = process.env.APPLE_CLIENT_ID ?? "com.pushmeup.app";
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

type AuthProvider = "google" | "apple";
type AppleJwk = JsonWebKey & { kid?: string; alg?: string };

let appleKeysCache:
  | {
      expiresAt: number;
      keys: AppleJwk[];
    }
  | undefined;

export const verifyAuthProviderToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestedProvider = req.body?.provider;
  const provider = getProvider(requestedProvider) ?? inferProviderFromBearer(req);

  if (requestedProvider !== undefined && !getProvider(requestedProvider)) {
    res.status(400).json({ error: "Unsupported auth provider" });
    return;
  }

  if (provider === "apple") {
    await verifyAppleToken(req, res, next);
    return;
  }

  await verifyGoogleToken(req, res, next);
};

export const verifyGoogleToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCE,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.sub) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    console.log("[✅ Verified Google User]", payload);

    const body = req.body ?? {};
    const email = getNonEmptyString(payload.email) ?? getNonEmptyString(body.email);
    const name =
      getNonEmptyString(payload.name) ??
      getNonEmptyString(body.name) ??
      buildFallbackName(email);

    req.body = {
      ...body,
      id: payload.sub,
      email,
      name,
      photo: getNonEmptyString(payload.picture) ?? getNonEmptyString(body.photo) ?? "",
      provider: "google",
      providerUserId: payload.sub,
    };

    next();
  } catch (err) {
    console.error("[❌ Token verification failed]", err);
    res.status(401).json({ error: "Token verification failed" });
  }
};

async function verifyAppleToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  const identityToken = authHeader.split(" ")[1];

  try {
    const payload = await verifyAppleIdentityToken(identityToken);

    if (!payload.sub) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    const body = req.body ?? {};
    const email = getNonEmptyString(payload.email);

    req.body = {
      ...body,
      id: payload.sub,
      email,
      name: getNonEmptyString(body.name),
      photo: "",
      provider: "apple",
      providerUserId: payload.sub,
    };

    next();
  } catch (err) {
    console.error("[Apple token verification failed]", err);
    res.status(401).json({ error: "Token verification failed" });
  }
}

async function verifyAppleIdentityToken(identityToken: string): Promise<JwtPayload> {
  const decoded = jwt.decode(identityToken, { complete: true });

  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid Apple token");
  }

  const kid = decoded.header.kid;
  if (!kid) {
    throw new Error("Missing Apple token key id");
  }

  const jwk = await getAppleJwk(kid);
  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const verified = jwt.verify(identityToken, publicKey, {
    algorithms: ["RS256"],
    audience: APPLE_AUDIENCE,
    issuer: APPLE_ISSUER,
  });

  if (!isJwtPayload(verified)) {
    throw new Error("Invalid Apple token payload");
  }

  return verified;
}

async function getAppleJwk(kid: string): Promise<AppleJwk> {
  const keys = await getAppleJwks();
  const key = keys.find((candidate) => candidate.kid === kid);

  if (!key) {
    appleKeysCache = undefined;
    const refreshedKeys = await getAppleJwks();
    const refreshedKey = refreshedKeys.find((candidate) => candidate.kid === kid);
    if (refreshedKey) return refreshedKey;
    throw new Error("Apple signing key not found");
  }

  return key;
}

async function getAppleJwks(): Promise<AppleJwk[]> {
  const now = Date.now();

  if (appleKeysCache && appleKeysCache.expiresAt > now) {
    return appleKeysCache.keys;
  }

  const response = await fetch(APPLE_JWKS_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch Apple JWKS: ${response.status}`);
  }

  const body = (await response.json()) as { keys?: AppleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];

  appleKeysCache = {
    expiresAt: now + 60 * 60 * 1000,
    keys,
  };

  return keys;
}

function getProvider(value: unknown): AuthProvider | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  return normalized === "apple" || normalized === "google"
    ? normalized
    : undefined;
}

function inferProviderFromBearer(req: Request): AuthProvider | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.split(" ")[1];
  const decoded = jwt.decode(token) as JwtPayload | string | null;

  if (!decoded || typeof decoded === "string") return undefined;

  if (decoded.iss === APPLE_ISSUER) return "apple";
  if (decoded.iss === "https://accounts.google.com" || decoded.iss === "accounts.google.com") {
    return "google";
  }

  return undefined;
}

function isJwtPayload(value: string | JwtPayload): value is JwtPayload {
  return typeof value !== "string";
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function buildFallbackName(email?: string): string {
  const localPart = email?.split("@")[0]?.trim();

  if (!localPart) {
    return "User";
  }

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
