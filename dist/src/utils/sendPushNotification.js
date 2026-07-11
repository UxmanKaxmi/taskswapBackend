"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = sendPushNotification;
exports.sendSilentPushNotification = sendSilentPushNotification;
// src/utils/sendPushNotification.ts
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const client_1 = require("../db/client");
let serviceAccount;
if (process.env.NODE_ENV === "production") {
    serviceAccount = require("/etc/secrets/firebase-adminsdk.json");
}
else {
    serviceAccount = require(path_1.default.resolve("firebase-adminsdk.json"));
}
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp({ credential: firebase_admin_1.default.credential.cert(serviceAccount) });
}
// FCM error codes that mean the token will never work again.
const DEAD_TOKEN_ERROR_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
]);
async function clearDeadToken(token) {
    try {
        const { count } = await client_1.prisma.user.updateMany({
            where: { fcmToken: token },
            data: { fcmToken: null },
        });
        if (count > 0) {
            console.warn(`🧹 Cleared dead FCM token for ${count} user(s)`);
        }
    }
    catch (error) {
        console.error("❌ Failed to clear dead FCM token:", error);
    }
}
async function sendPushNotification(token, title, body, data) {
    console.log("📲 Sending push to:", token, title, body);
    try {
        await firebase_admin_1.default.messaging().send({
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
    }
    catch (error) {
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
async function sendSilentPushNotification(token, data) {
    try {
        await firebase_admin_1.default.messaging().send({
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
    }
    catch (error) {
        console.error("❌ FCM silent Error:", error?.code ?? error);
        if (error?.code && DEAD_TOKEN_ERROR_CODES.has(error.code)) {
            await clearDeadToken(token);
        }
        return false;
    }
}
