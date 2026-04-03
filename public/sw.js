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
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        vibrate: [100, 50, 100],
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
