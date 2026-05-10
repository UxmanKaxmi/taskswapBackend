import { OAuth2Client } from "google-auth-library";
import { Request, Response, NextFunction } from "express";

const client = new OAuth2Client();

const getJwtHeader = (token: string): { alg?: string } | null => {
  const header = token.split(".")[0];

  if (!header) return null;

  try {
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  } catch {
    return null;
  }
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

  const jwtHeader = getJwtHeader(idToken);
  if (jwtHeader?.alg === "HS256") {
    res.status(401).json({
      error: "Expected Google ID token, received app JWT",
    });
    return;
  }

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

    req.body.id = payload.sub;
    req.body.email = payload.email;
    req.body.name = payload.name;
    req.body.photo = payload.picture;

    next();
  } catch (err) {
    console.error("[❌ Token verification failed]", err);
    res.status(401).json({ error: "Token verification failed" });
  }
};
