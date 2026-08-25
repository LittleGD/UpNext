/**
 * 로컬 알림 유틸리티
 *
 * 경로 분기:
 *  - 웹/PWA/TWA: 서비스워커 postMessage 스케줄링 (기존 경로 그대로)
 *  - 안드로이드 Capacitor: notificationsNative.ts (@capacitor/local-notifications)
 *    — WebView 에는 Notification API 가 없고, SW 타이머는 워커 퇴출 시 유실되므로
 *    네이티브 스케줄(재부팅 재등록 포함)로 대체한다. (트랙3 C4)
 *
 * lang 파라미터는 네이티브 채널명/문구 로컬라이즈용. 호출부(스토어/설정)가
 * progress.language 를 넘긴다 — 이 모듈이 게임 스토어를 import 하면 순환이라 파라미터로 받는다.
 */
import type { Language } from "@/types/game";
import { isAndroidNative } from "@/lib/platform";
import {
  nativeRequestPermission,
  nativeGetPermission,
  nativeScheduleDailyReminder,
  nativeCancelDailyReminder,
  nativeScheduleChallengeReminder,
  nativeCancelChallengeReminder,
  nativeShowInstant,
  nativeScheduleExtraNudge,
  nativeCancelExtraNudge,
} from "@/lib/notificationsNative";

export async function requestNotificationPermission(): Promise<boolean> {
  if (isAndroidNative()) return nativeRequestPermission();
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (isAndroidNative()) {
    // 네이티브 조회는 비동기라 동기 API 로는 낙관값을 돌려주고,
    // 정확한 상태가 필요한 화면은 getNotificationPermissionAsync 를 쓴다.
    return "default";
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** 네이티브까지 정확한 권한 상태가 필요한 호출부용 (설정 화면). */
export async function getNotificationPermissionAsync(): Promise<
  NotificationPermission | "unsupported"
> {
  if (isAndroidNative()) return nativeGetPermission();
  return getNotificationPermission();
}

/**
 * 데일리 리마인더. body/lang 은 네이티브 경로에서 사용 (SW 경로도 body 를
 * 전달받으면 로컬라이즈된 문구를 쓰고, 없으면 sw.js 기본 문구).
 */
export function scheduleLocalReminder(time: string, body?: string, lang: Language = "ko"): void {
  if (isAndroidNative()) {
    if (body) void nativeScheduleDailyReminder(time, body, lang);
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_REMINDER",
      time,
      body,
    });
  }
}

export function cancelLocalReminder(): void {
  if (isAndroidNative()) {
    void nativeCancelDailyReminder();
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_REMINDER",
    });
  }
}

// === 챌린지 리마인더 (4시간 간격) ===

export function scheduleChallengeReminder(message: string, lang: Language = "ko"): void {
  if (isAndroidNative()) {
    void nativeScheduleChallengeReminder(message, lang);
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_CHALLENGE_REMINDER",
      message,
    });
  }
}

export function cancelChallengeReminder(): void {
  if (isAndroidNative()) {
    void nativeCancelChallengeReminder();
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_CHALLENGE_REMINDER",
    });
  }
}

// === 상시 알림 (위젯 대체) ===

export function showChallengeStatus(challenges: Array<{ name: string; completed: boolean }>): void {
  // 안드로이드 네이티브에서는 홈 위젯이 이 역할을 대체한다 (트랙3 C3) — 상시
  // 알림까지 띄우면 이중 노출이라 no-op.
  if (isAndroidNative()) return;
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_CHALLENGE_STATUS",
      challenges,
    });
  }
}

export function hideChallengeStatus(): void {
  if (isAndroidNative()) return;
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "HIDE_CHALLENGE_STATUS",
    });
  }
}

// === 즉시 알림 (완료 축하) ===
// tag로 중복 방지: 같은 tag면 기존 알림을 덮어씀
export function showInstantNotify(
  title: string,
  body: string,
  tag: string,
  lang: Language = "ko",
): void {
  if (isAndroidNative()) {
    void nativeShowInstant(title, body, tag, lang);
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_INSTANT_NOTIFY",
      title,
      body,
      tag,
    });
  }
}

// === 추가 챌린지 넛지 (2시간 뒤 1회) ===
// delayMs는 기본 2시간. DND(23~7시)는 SW/네이티브 각자 체크.
export function scheduleExtraNudge(
  title: string,
  body: string,
  delayMs: number = 2 * 60 * 60 * 1000,
  lang: Language = "ko",
): void {
  if (isAndroidNative()) {
    void nativeScheduleExtraNudge(title, body, delayMs, lang);
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_EXTRA_NUDGE",
      title,
      body,
      delayMs,
    });
  }
}

export function cancelExtraNudge(): void {
  if (isAndroidNative()) {
    void nativeCancelExtraNudge();
    return;
  }
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_EXTRA_NUDGE",
    });
  }
}
