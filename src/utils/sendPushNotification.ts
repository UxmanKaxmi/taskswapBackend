// src/utils/sendPushNotification.ts
import admin from "firebase-admin";
import path from "path";

let serviceAccount: admin.ServiceAccount;

if (process.env.NODE_ENV === "production") {
  serviceAccount = require("/etc/secrets/firebase-adminsdk.json");
} else {
  serviceAccount = require(path.resolve("firebase-adminsdk.json"));
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  console.log("📲 Sending push to:", token, title, body);

  try {
    await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
      ...(data ? { data } : {}),
    });
    console.log("✅ Notification sent");
  } catch (error) {
    console.error("❌ FCM Error:", error);
  }
}
