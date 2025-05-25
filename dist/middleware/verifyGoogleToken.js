"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGoogleToken = void 0;
const google_auth_library_1 = require("google-auth-library");
const client = new google_auth_library_1.OAuth2Client();
const verifyGoogleToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid token" });
        return;
    }
    const idToken = authHeader.split(" ")[1];
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: "424884151196-8b2midonidm3m1u77konerbc6its5knv.apps.googleusercontent.com",
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
    }
    catch (err) {
        console.error("[❌ Token verification failed]", err);
        res.status(401).json({ error: "Token verification failed" });
    }
};
exports.verifyGoogleToken = verifyGoogleToken;
