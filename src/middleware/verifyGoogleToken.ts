import { OAuth2Client } from "google-auth-library";
import { Request, Response, NextFunction } from "express";

const client = new OAuth2Client();

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
      audience:
        "424884151196-8b2midonidm3m1u77konerbc6its5knv.apps.googleusercontent.com",
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
    };

    next();
  } catch (err) {
    console.error("[❌ Token verification failed]", err);
    res.status(401).json({ error: "Token verification failed" });
  }
};

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
