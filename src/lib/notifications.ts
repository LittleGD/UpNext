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
