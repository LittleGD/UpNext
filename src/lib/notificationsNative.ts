/**
 * 안드로이드 Capacitor 네이티브 알림 (트랙3 C4).
 *
 * WebView 에는 Notification API 가 없어 SW 경로가 통째로 죽는다.
 * isAndroidNative() 일 때 notifications.ts 가 이 모듈로 위임한다.
 *
 * SW(setTimeout) 대비 개선점: @capacitor/local-notifications 는 스케줄을
 * 네이티브에 영속하고 BOOT_COMPLETED 리시버로 재부팅 후에도 재등록한다.
 * (SW 는 브라우저가 워커를 퇴출하면 리마인더가 조용히 사라졌다)
 *
 * ID 대역 (충돌 방지용 고정 할당):
 *  - 1001        데일리 리마인더 (매일 반복)
 *  - 2000-2011   4시간 챌린지 리마인더 슬롯 (48시간 선계산)
 *  - 3001        추가 챌린지 넛지 (1회)
 *  - 4000-4999   즉시 알림 (tag 해시 → 같은 tag 는 같은 id 로 덮어씀)
 *
 * DND 23:00-07:00 은 sw.js 의 동작을 미러한다.
 */
import type { Language } from "@/types/game";
import { t } from "@/i18n";

const DAILY_REMINDER_ID = 1001;
const CHALLENGE_SLOT_BASE = 2000;
const CHALLENGE_SLOT_COUNT = 12; // 4시간 x 12 = 48시간 선계산
const EXTRA_NUDGE_ID = 3001;
const INSTANT_BASE = 4000;

const CHANNEL_REMINDER = "reminder";
const CHANNEL_CELEBRATION = "celebration";

const DND_START_HOUR = 23;
const DND_END_HOUR = 7;

type LocalNotificationsPlugin =
  typeof import("@capacitor/local-notifications").LocalNotifications;

let cachedPlugin: LocalNotificationsPlugin | null = null;
let channelsReady = false;

async function getPlugin(): Promise<LocalNotificationsPlugin | null> {
  if (cachedPlugin) return cachedPlugin;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    cachedPlugin = LocalNotifications;
    return cachedPlugin;
  } catch {
    return null;
  }
}

/** 채널은 1회 생성이면 충분 (이름 변경은 언어 변경 시 재생성으로 반영). */
async function ensureChannels(lang: Language): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin || channelsReady) return;
  try {
    await plugin.createChannel({
      id: CHANNEL_REMINDER,
      name: t("notif.channel.reminder", lang),
      importance: 3,
    });
    await plugin.createChannel({
      id: CHANNEL_CELEBRATION,
      name: t("notif.channel.celebration", lang),
      importance: 2,
    });
    channelsReady = true;
  } catch {
    // 채널 생성 실패는 치명적이지 않다 — 기본 채널로 폴백
  }
}

function isInDnd(d: Date): boolean {
  const h = d.getHours();
  return h >= DND_START_HOUR || h < DND_END_HOUR;
}

/** DND 에 걸리면 다음 07:05 로 미룬다. */
function deferOutOfDnd(d: Date): Date {
  if (!isInDnd(d)) return d;
  const out = new Date(d);
  if (d.getHours() >= DND_START_HOUR) out.setDate(out.getDate() + 1);
  out.setHours(DND_END_HOUR, 5, 0, 0);
  return out;
}

// === 권한 ===

export async function nativeRequestPermission(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  const res = await plugin.requestPermissions();
  return res.display === "granted";
}

export async function nativeGetPermission(): Promise<NotificationPermission | "unsupported"> {
  const plugin = await getPlugin();
  if (!plugin) return "unsupported";
  const res = await plugin.checkPermissions();
  if (res.display === "granted") return "granted";
  if (res.display === "denied") return "denied";
  return "default";
}

// === 데일리 리마인더 (매일 HH:mm 반복) ===

export async function nativeScheduleDailyReminder(
  time: string,
  body: string,
  lang: Language,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await ensureChannels(lang);
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
  await plugin.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  await plugin.schedule({
    notifications: [
      {
        id: DAILY_REMINDER_ID,
        title: "UpNext",
        body,
        channelId: CHANNEL_REMINDER,
        // on: 매일 반복 + allowWhileIdle: doze 에서도 발화
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      },
    ],
  });
}

export async function nativeCancelDailyReminder(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
}

// === 4시간 챌린지 리마인더 (DND 스킵 슬롯 선계산) ===

export async function nativeScheduleChallengeReminder(
  message: string,
  lang: Language,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await ensureChannels(lang);
  await nativeCancelChallengeReminder();
  const now = Date.now();
  const notifications = [];
  for (let i = 1; i <= CHALLENGE_SLOT_COUNT; i++) {
    const at = new Date(now + i * 4 * 60 * 60 * 1000);
    if (isInDnd(at)) continue; // sw.js 미러: DND 슬롯은 건너뛴다 (미루지 않음)
    notifications.push({
      id: CHALLENGE_SLOT_BASE + i,
      title: "UpNext",
      body: message,
      channelId: CHANNEL_REMINDER,
      schedule: { at, allowWhileIdle: true },
    });
  }
  if (notifications.length > 0) await plugin.schedule({ notifications });
}

export async function nativeCancelChallengeReminder(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  const ids = [];
  for (let i = 1; i <= CHALLENGE_SLOT_COUNT; i++) {
    ids.push({ id: CHALLENGE_SLOT_BASE + i });
  }
  await plugin.cancel({ notifications: ids });
}

// === 즉시 알림 (완료 축하 등) ===

function tagToId(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return INSTANT_BASE + (Math.abs(h) % 1000);
}

export async function nativeShowInstant(
  title: string,
  body: string,
  tag: string,
  lang: Language,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await ensureChannels(lang);
  await plugin.schedule({
    notifications: [
      // 같은 tag 는 같은 id → 기존 알림 덮어쓰기 (sw.js 의 tag 시맨틱 미러)
      { id: tagToId(tag), title, body, channelId: CHANNEL_CELEBRATION },
    ],
  });
}

// === 추가 챌린지 넛지 (기본 2시간 뒤 1회, DND 는 다음 아침으로) ===

export async function nativeScheduleExtraNudge(
  title: string,
  body: string,
  delayMs: number,
  lang: Language,
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await ensureChannels(lang);
  await plugin.cancel({ notifications: [{ id: EXTRA_NUDGE_ID }] });
  const at = deferOutOfDnd(new Date(Date.now() + delayMs));
  await plugin.schedule({
    notifications: [
      {
        id: EXTRA_NUDGE_ID,
        title,
        body,
        channelId: CHANNEL_REMINDER,
        schedule: { at, allowWhileIdle: true },
      },
    ],
  });
}

export async function nativeCancelExtraNudge(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.cancel({ notifications: [{ id: EXTRA_NUDGE_ID }] });
}
