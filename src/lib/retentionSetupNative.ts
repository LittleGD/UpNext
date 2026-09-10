import { LocalNotifications } from "@capacitor/local-notifications";
import { isAndroidNative } from "@/lib/platform";
import { nativeScheduleDailyReminder } from "@/lib/notificationsNative";
import type { Language } from "@/types/game";

export { widgetBridge as retentionSetupNative } from "@/lib/widget";
import { widgetBridge } from "@/lib/widget";

/** Older installed shells have no setup methods. Never show a dead native CTA. */
export async function getRetentionSetupCapabilities() {
  if (!isAndroidNative()) return null;
  try { return await widgetBridge.getSetupState(); }
  catch { return null; }
}

export async function hasNativeDailyReminder() {
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return false;
  return (await LocalNotifications.getPending()).notifications.some(item => item.id === 1001);
}

export async function enableNativeDailyReminder(time: string, body: string, lang: Language) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Invalid reminder time");
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return false;
  await nativeScheduleDailyReminder(time, body, lang);
  if (!await hasNativeDailyReminder()) throw new Error("Reminder registration failed");
  return true;
}
