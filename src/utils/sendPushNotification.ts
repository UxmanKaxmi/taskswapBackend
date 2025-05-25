// src/utils/sendPushNotification.ts
import admin from "firebase-admin";
import path from "path";

const serviceAccount = require(path.resolve("firebase-adminsdk.json")); // or use process.env if env-based

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string
) {
  console.log("📲 Sending push to:", token, title, body);

  try {
    await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
    });
    console.log("✅ Notification sent");
  } catch (error) {
    console.error("❌ FCM Error:", error);
  }
}
