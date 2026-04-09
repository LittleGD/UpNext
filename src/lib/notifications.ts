/**
 * 로컬 알림 유틸리티
 * 서비스워커 기반 일일 리마인더 스케줄링
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function scheduleLocalReminder(time: string): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_REMINDER",
      time,
    });
  }
}

export function cancelLocalReminder(): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_REMINDER",
    });
  }
}

// === 챌린지 리마인더 (4시간 간격) ===

export function scheduleChallengeReminder(message: string): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_CHALLENGE_REMINDER",
      message,
    });
  }
}

export function cancelChallengeReminder(): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_CHALLENGE_REMINDER",
    });
  }
}

// === 상시 알림 (위젯 대체) ===

export function showChallengeStatus(challenges: Array<{ name: string; completed: boolean }>): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_CHALLENGE_STATUS",
      challenges,
    });
  }
}

export function hideChallengeStatus(): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "HIDE_CHALLENGE_STATUS",
    });
  }
}

// === 즉시 알림 (완료 축하) ===
// tag로 중복 방지: 같은 tag면 기존 알림을 덮어씀
export function showInstantNotify(title: string, body: string, tag: string): void {
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
// delayMs는 기본 2시간. DND(23~7시)는 SW에서 체크.
export function scheduleExtraNudge(title: string, body: string, delayMs: number = 2 * 60 * 60 * 1000): void {
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
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_EXTRA_NUDGE",
    });
  }
}
