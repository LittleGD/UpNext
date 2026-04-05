// UpNext Service Worker — 오프라인 캐싱 + 앱 셸
const CACHE_NAME = "upnext-v1";

// 앱 셸: 오프라인에서도 기본 UI가 보이도록 캐싱
const APP_SHELL = ["/", "/icons/icon-192x192.png", "/icons/icon-512x512.png"];

// Install: 앱 셸 프리캐시
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: 이전 캐시 제거
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: 네트워크 우선, 실패 시 캐시 폴백
self.addEventListener("fetch", (event) => {
  // API 요청이나 non-GET은 캐시하지 않음
  if (event.request.method !== "GET") return;

  // 외부 리소스(fonts, analytics 등)는 네트워크 전용
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 정상 응답만 캐싱
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notification 처리
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || "UpNext";
    const body = data.body || "";
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        vibrate: [100, 50, 100],
      })
    );
  } catch (_) {
    // malformed push payload — skip
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});

// === 로컬 리마인더 스케줄링 ===
let reminderTimeout = null;

function scheduleNextReminder(timeStr) {
  if (reminderTimeout) clearTimeout(reminderTimeout);

  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // 오늘 시간이 지났으면 내일로
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay = target.getTime() - now.getTime();

  reminderTimeout = setTimeout(() => {
    self.registration.showNotification("UpNext", {
      body: "Time to draw your cards! 🎴",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      vibrate: [100, 50, 100],
      tag: "daily-reminder",
    });
    // 다음날 재스케줄
    scheduleNextReminder(timeStr);
  }, delay);
}

// === 챌린지 리마인더 (4시간 간격) ===
let challengeInterval = null;

function scheduleChallengeReminder(data) {
  cancelChallengeReminder();

  function check() {
    const now = new Date();
    const hour = now.getHours();
    // 23시~7시 방해금지
    if (hour >= 7 && hour < 23) {
      self.registration.showNotification("UpNext", {
        body: data.message || "오늘 챌린지가 남아있어요!",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        vibrate: [100, 50, 100],
        tag: "challenge-reminder",
      });
    }
    challengeInterval = setTimeout(check, 4 * 60 * 60 * 1000);
  }

  // 첫 알림은 4시간 후
  challengeInterval = setTimeout(check, 4 * 60 * 60 * 1000);
}

function cancelChallengeReminder() {
  if (challengeInterval) clearTimeout(challengeInterval);
  challengeInterval = null;
}

// === 상시 알림 (위젯 대체) ===
function showChallengeStatus(data) {
  const lines = data.challenges.map((c) =>
    (c.completed ? "✅ " : "⬜ ") + c.name
  );
  self.registration.showNotification("UpNext — 오늘의 챌린지", {
    body: lines.join("\n"),
    tag: "challenge-status",
    requireInteraction: true,
    silent: true,
    icon: "/icons/icon-192x192.png",
  });
}

function hideChallengeStatus() {
  self.registration.getNotifications({ tag: "challenge-status" }).then((n) =>
    n.forEach((notif) => notif.close())
  );
}

self.addEventListener("message", (event) => {
  const { type } = event.data || {};
  if (type === "SCHEDULE_REMINDER") {
    scheduleNextReminder(event.data.time);
  } else if (type === "CANCEL_REMINDER") {
    if (reminderTimeout) clearTimeout(reminderTimeout);
    reminderTimeout = null;
  } else if (type === "SCHEDULE_CHALLENGE_REMINDER") {
    scheduleChallengeReminder(event.data);
  } else if (type === "CANCEL_CHALLENGE_REMINDER") {
    cancelChallengeReminder();
  } else if (type === "SHOW_CHALLENGE_STATUS") {
    showChallengeStatus(event.data);
  } else if (type === "HIDE_CHALLENGE_STATUS") {
    hideChallengeStatus();
  }
});
