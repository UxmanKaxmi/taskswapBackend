"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = sendPushNotification;
// src/utils/sendPushNotification.ts
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const serviceAccount = require(path_1.default.resolve("firebase-adminsdk.json")); // or use process.env if env-based
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccount),
    });
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
