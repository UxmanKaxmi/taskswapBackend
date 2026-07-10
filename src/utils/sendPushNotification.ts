// src/utils/sendPushNotification.ts
import admin from "firebase-admin";
import path from "path";
import { prisma } from "../db/client";

let serviceAccount: admin.ServiceAccount;

if (process.env.NODE_ENV === "production") {
  serviceAccount = require("/etc/secrets/firebase-adminsdk.json");
} else {
  serviceAccount = require(path.resolve("firebase-adminsdk.json"));
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// FCM error codes that mean the token will never work again.
const DEAD_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

async function clearDeadToken(token: string) {
  try {
    const { count } = await prisma.user.updateMany({
      where: { fcmToken: token },
      data: { fcmToken: null },
    });
    if (count > 0) {
      console.warn(`🧹 Cleared dead FCM token for ${count} user(s)`);
    }
  } catch (error) {
    console.error("❌ Failed to clear dead FCM token:", error);
  }
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  console.log("📲 Sending push to:", token, title, body);

  try {
    await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
      android: {
        // High priority so reminders are delivered promptly even in Doze mode.
        priority: "high",
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
      ...(data ? { data } : {}),
    });
    console.log("✅ Notification sent");
    return true;
  } catch (error: any) {
    console.error("❌ FCM Error:", error?.code ?? error);

    if (error?.code && DEAD_TOKEN_ERROR_CODES.has(error.code)) {
      await clearDeadToken(token);
    }

    return false;
  }
}

// Data-only ("silent") push: no notification block, so the OS never shows a
// banner. The client reads `data` in its foreground FCM handler and renders an
// in-app UI (e.g. the "X pushed you" pill). On iOS this requires the
// content-available background flag; on Android a high-priority data message.
export async function sendSilentPushNotification(
  token: string,
  data: Record<string, string>
): Promise<boolean> {
  try {
    await admin.messaging().send({
      token,
      data,
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-push-type": "background",
          // Silent pushes must use priority 5; 10 is rejected for background.
          "apns-priority": "5",
        },
        payload: {
          aps: {
            contentAvailable: true,
          },
        },
      },
    });
    return true;
  } catch (error: any) {
    console.error("❌ FCM silent Error:", error?.code ?? error);

    if (error?.code && DEAD_TOKEN_ERROR_CODES.has(error.code)) {
      await clearDeadToken(token);
    }

    return false;
  }
}
