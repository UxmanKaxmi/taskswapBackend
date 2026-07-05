import jwt from "jsonwebtoken";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_ISSUER = "https://appleid.apple.com";

type AppleTokenResponse = {
  refresh_token?: string;
};

export async function exchangeAppleAuthorizationCode(
  authorizationCode?: string
): Promise<string | undefined> {
  if (!authorizationCode) return undefined;

  const clientSecret = createAppleClientSecret();
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!clientSecret || !clientId) {
    console.warn(
      "[APPLE_AUTH] Skipping authorization code exchange; Apple client secret config is incomplete"
    );
    return undefined;
  }

  const response = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[APPLE_AUTH] Authorization code exchange failed", {
      status: response.status,
      body: errorBody,
    });
    return undefined;
  }

  const body = (await response.json()) as AppleTokenResponse;
  return body.refresh_token;
}

export async function revokeAppleRefreshToken(
  refreshToken?: string | null
): Promise<void> {
  if (!refreshToken) return;

  const clientSecret = createAppleClientSecret();
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!clientSecret || !clientId) {
    console.warn(
      "[APPLE_AUTH] Skipping Apple token revocation; Apple client secret config is incomplete"
    );
    return;
  }

  const response = await fetch(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[APPLE_AUTH] Apple token revocation failed", {
      status: response.status,
      body: errorBody,
    });
  }
}

function createAppleClientSecret(): string | undefined {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientId || !teamId || !keyId || !privateKey) {
    return undefined;
  }

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    audience: APPLE_ISSUER,
    expiresIn: "180d",
    issuer: teamId,
    keyid: keyId,
    subject: clientId,
  });
}
