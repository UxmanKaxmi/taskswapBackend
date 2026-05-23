import { sendPushNotification } from "./sendPushNotification";

export function schedulePush(
  delayMs: number,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string | number | boolean | null | undefined>
) {
  setTimeout(async () => {
    try {
      await sendPushNotification(token, title, body, data);
    } catch (e) {
      console.error("❌ Failed to send scheduled push:", e);
    }
  }, delayMs);
}
