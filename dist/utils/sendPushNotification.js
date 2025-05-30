"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = sendPushNotification;
// src/utils/sendPushNotification.ts
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
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
async function sendPushNotification(token, title, body) {
    console.log("📲 Sending push to:", token, title, body);
    try {
        await firebase_admin_1.default.messaging().send({
            token,
            notification: {
                title,
                body,
            },
        });
        console.log("✅ Notification sent");
    }
    catch (error) {
        console.error("❌ FCM Error:", error);
    }
}
