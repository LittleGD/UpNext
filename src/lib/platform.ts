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
