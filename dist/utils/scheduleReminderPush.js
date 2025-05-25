"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulePush = schedulePush;
const sendPushNotification_1 = require("./sendPushNotification");
function schedulePush(delayMs, token, title, body) {
    setTimeout(async () => {
        try {
            await (0, sendPushNotification_1.sendPushNotification)(token, title, body);
        }
        catch (e) {
            console.error("❌ Failed to send scheduled push:", e);
        }
    }, delayMs);
}
