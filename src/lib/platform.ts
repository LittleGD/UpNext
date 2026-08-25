/**
 * 플랫폼 감지 유틸. 웹 / 안드로이드 TWA / iOS Capacitor 세 경로에서 공통 사용.
 *
 * - `isNative()`: Capacitor WKWebView 안에서 실행 중인지. 현재는 iOS만 Capacitor 사용
 *   (안드로이드는 별도 TWA로, PWA/Chrome에서 돌기 때문에 false).
 * - `getNativePlatform()`: "ios" | "android" | "web" — 추후 Android Capacitor 이관 대비.
 *
 * window.Capacitor 전역 접근 패턴: @capacitor/core를 static import하면 웹 번들 크기
 * (~2KB)에 영향 → 전역을 체크하는 편이 SSR + web + Android TWA에 동일하게 안전.
 * Capacitor WKWebView는 로드 시 자동으로 window.Capacitor를 주입함.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function getCap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNative(): boolean {
  return getCap()?.isNativePlatform?.() ?? false;
}

export function getNativePlatform(): "ios" | "android" | "web" {
  const cap = getCap();
  if (!cap?.isNativePlatform?.()) return "web";
  const p = cap.getPlatform?.();
  if (p === "ios" || p === "android") return p;
  return "web";
}

export function isIos(): boolean {
  return getNativePlatform() === "ios";
}

export function isAndroidNative(): boolean {
  return getNativePlatform() === "android";
}

/**
 * 안드로이드 TWA(Play Store 래퍼)에서 실행 중인지 감지. (트랙 3 Phase D-1)
 *
 * 1) `document.referrer` 가 "android-app://app.vercel.upnext" 로 시작하면 확정.
 *    이 referrer 는 TWA 최초 진입 문서에서만 세팅되고 인앱 네비게이션에선
 *    빈 값이 되므로, 감지 즉시 localStorage 에 영속해 이후에도 유지한다.
 * 2) 영속 플래그(upnext_is_android_twa)가 있으면 TWA 로 판정.
 * 3) 폴백: Android UA + display-mode standalone + 비 Capacitor.
 *    (referrer 를 못 잡은 홈화면 설치 PWA 도 포함되지만, Play Store 전환
 *    안내 대상으로는 동일하게 유효한 사용자군)
 *
 * 트랙 3에서 Capacitor 앱으로 전환되면 isNative()=true 가 되어 자동으로 false.
 */
const TWA_FLAG_KEY = "upnext_is_android_twa";
const TWA_REFERRER_PREFIX = "android-app://app.vercel.upnext";

export function isAndroidTwa(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative()) return false;
  try {
    if (document.referrer.startsWith(TWA_REFERRER_PREFIX)) {
      localStorage.setItem(TWA_FLAG_KEY, "1");
      return true;
    }
    if (localStorage.getItem(TWA_FLAG_KEY) === "1") return true;
  } catch {
    // localStorage 접근 불가(시크릿 모드 등) — 아래 UA 폴백으로 진행
  }
  const isAndroidUa = /Android/i.test(navigator.userAgent);
  const isStandaloneDisplay =
    window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  return isAndroidUa && isStandaloneDisplay;
}
