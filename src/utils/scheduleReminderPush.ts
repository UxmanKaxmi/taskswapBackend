import { sendPushNotification } from "./sendPushNotification";

export function schedulePush(
  delayMs: number,
  token: string,
  title: string,
  body: string
) {
  setTimeout(async () => {
    try {
      await sendPushNotification(token, title, body);
    } catch (e) {
      console.error("❌ Failed to send scheduled push:", e);
    }
  }, delayMs);
}
