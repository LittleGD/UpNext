/**
 * 저성능 기기 감지 — 2018~2019년 안드로이드 폰 (Note 9, S9, S10 등)을 타겟.
 *
 * 시그널:
 *   - `navigator.deviceMemory` (Chrome, Android Chrome 지원). Note 9 (6GB RAM)
 *     는 스펙상 4GB 로 라운딩되어 <=4 로 감지.
 *   - `navigator.hardwareConcurrency` <= 4 (저가 기기). Note 9 는 8 코어라
 *     여기 안 걸리지만, deviceMemory 로 걸림.
 *   - `prefers-reduced-motion: reduce` — 유저가 이미 모션 감쇄를 요청.
 *
 * 사용처:
 *   - 항상 켜져있는 캔버스 이펙트 (PixelStars, MeteorShower) 를 30fps 로 throttle.
 *   - 블러가 많은 레이어의 radius 축소.
 *
 * SSR 안전: 서버 측에서는 false 반환 (안전한 default).
 */
export function isLowEndDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // deviceMemory: Chrome/Android/Edge 에서 지원. iOS Safari/Firefox 는 undefined.
  const nav = navigator as Navigator & {
    deviceMemory?: number;
  };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) {
    return true;
  }

  // hardwareConcurrency: 4코어 이하 저가 칩. 거의 모든 브라우저 지원.
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) {
    return true;
  }

  // 유저가 reduced-motion 을 켠 상태라면 저성능 취급 (그들이 원하는 바).
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return true;
  }

  return false;
}

/**
 * Low-end 감지 캐시. 첫 호출 시 1회 평가 후 결과 고정 (세션 내내 동일).
 *   매 렌더마다 matchMedia 쿼리 돌리는 비용을 피하기 위함.
 */
let _cached: boolean | null = null;
export function isLowEndDeviceCached(): boolean {
  if (_cached === null) {
    _cached = isLowEndDevice();
  }
  return _cached;
}
