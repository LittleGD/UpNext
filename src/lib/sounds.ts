/** Authored sample playback; existing haptic intent remains independent of audio. */
import { isNative } from "@/lib/platform";
import { appAudio } from "./audio";
import type { SoundName } from "./audioCatalog";
export type { SoundName } from "./audioCatalog";

export function playSound(name: SoundName): void {
  appAudio.play(name);
}

/* === 햅틱(진동) 피드백 === */
const VIBRATION_PATTERNS: Partial<Record<SoundName, number[] | null>> = {
  select:       [8],
  confirm:      [15],
  cancel:       [15],
  cardFlip:     [15],
  cardSelect:   [8],
  cardHover:    null,            // 너무 빈번 — 진동 없음
  cardPreview:  [8],
  packOpen:     [10, 30, 10],
  complete:     [10, 30, 10],
  fullClear:    [20, 20, 30],
  levelUp:      [20, 20, 30],
  equip:        [8],
  xpGain:       [15],
  chargeUp:     [30, 10, 40],
  ambientFloat: null,            // 배경음 — 진동 없음
  pulseWave:    [30, 10, 40],
  collect:      [8],
  fireIgnite:   [20, 20, 30],
  impactShake:  [30, 10, 40],
  superIgnite:  [30, 10, 40],
  meteorWhoosh: [30, 10, 40],
  matchPair:    [15],
  curseTrigger: [30, 10, 40],
  rewardChoose: [10, 30, 10],
  cameraShutter: [8],
  polaroidSlide: [15],
  treeGrow:      [10, 30, 10],
  // 굴림틀
  // Phase 5-B — 강화 상위 밴드
  enhanceCharge:      [10, 40, 10, 40, 15],
  enhanceSuccessHigh: [20, 30, 40],
  enhanceSuccessMax:  [30, 40, 30, 40, 60],
  enhanceShatter:     [60, 30, 20],
};

const MIN_VIBRATION_MS = 25;

function normalizePattern(pattern: number[]): number[] {
  return pattern.map((v, i) =>
    // 홀수 인덱스는 pause, 짝수(및 단일)는 vibrate → vibrate만 클램핑
    pattern.length === 1 || i % 2 === 0 ? Math.max(v, MIN_VIBRATION_MS) : v
  );
}

/**
 * iOS 네이티브 햅틱 의도 매핑.
 *
 * 설계 원칙: 사운드별 "느낌"을 명시적 intent로 선언 → 패턴 길이/숫자 기반 휴리스틱 폐기.
 * 디자이너 의도(사운드의 무게감/감정)와 햅틱 강도가 1:1로 보이게 만들어 추후 튜닝 용이.
 *
 * iOS Apple HIG 매핑:
 * - "selection": UISelectionFeedbackGenerator — 가벼운 선택/스크롤.
 *                Capacitor Haptics 는 selectionStart() 뒤에만 selectionChanged() 를
 *                실제로 울린다(start 없이는 no-op). 그래서 계약은 start → changed* → end:
 *                문지르기처럼 연속 틱이 필요한 곳은 beginSelectionHaptics()/
 *                endSelectionHaptics() 로 세션을 열고, 세션 밖의 단발 호출은
 *                triggerNativeHaptic 이 start/changed/end 를 스스로 감싼다.
 * - "light":     UIImpactFeedbackGenerator(.light) — 작은 물리 이벤트
 * - "medium":    UIImpactFeedbackGenerator(.medium) — 분명한 물리 이벤트
 * - "heavy":     UIImpactFeedbackGenerator(.heavy) — 강한 충격/대미지
 * - "success":   UINotificationFeedbackGenerator(.success) — 완료/달성
 * - "warning":   UINotificationFeedbackGenerator(.warning) — 부정적 이벤트
 * - "celebration": Heavy → 100ms 후 Success — 레벨업 등 "큰 보상" 컴파운드
 * - "rigid":     레버 당김. UIImpactFeedbackStyle.rigid 의도 — Capacitor Haptics 엔
 *                rigid 가 없어 Heavy 로 근사한다. 네이티브 SwiftUI 는 .rigid 를 쓸 것.
 * - "double":    Medium ×2 (90ms 간격) — 굴림틀 mid 티어
 * - "triple":    Heavy ×2 → Success (90ms 간격) — 굴림틀 big 티어
 */
type HapticIntent =
  | "selection"
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "celebration"
  | "rigid"
  | "double"
  | "triple";

const HAPTIC_INTENT: Partial<Record<SoundName, HapticIntent | null>> = {
  // 선택 — UI 탐색
  select:        "selection",
  cardSelect:    "selection",
  cardPreview:   "selection",
  cardHover:     null,         // 너무 빈번
  equip:         "selection",
  cameraShutter: "selection",

  // 가벼운 임팩트 — 사소한 물리 이벤트
  cardFlip:      "light",
  polaroidSlide: "light",
  xpGain:        "light",
  cancel:        "light",

  // 중간 임팩트 — 분명한 사용자 액션
  confirm:       "medium",   // 확정 — 가벼운 "딸깍"보다 무게감
  collect:       "medium",   // 사운드: heavy thud + metallic lock — 무게감 일치
  matchPair:     "medium",   // 매칭 성공 — 짧은 보상 임팩트

  // 강한 임팩트 — 격렬한 이펙트
  impactShake:   "heavy",
  fireIgnite:    "heavy",    // 불 점화 — "축하"가 아닌 강력한 이벤트
  chargeUp:      "heavy",
  pulseWave:     "heavy",
  meteorWhoosh:  "heavy",
  superIgnite:   "heavy",

  // 성공 알림 — 완료/달성
  packOpen:      "success",
  complete:      "success",
  fullClear:     "success",
  treeGrow:      "success",
  rewardChoose:  "success",

  // 경고 알림 — 부정적
  curseTrigger:  "warning",

  // 컴파운드 — Heavy + Success 더블 임팩트로 "큰 보상" 강조
  levelUp:       "celebration",

  // 햅틱 없음
  ambientFloat:  null,

  // 굴림틀 — 스펙: 레버 rigid 1회 / 서스펜스 펄스 / 꽝 light 1회 /
  //   small medium / mid 더블 / big 트리플

  // Phase 5-B — 강화 상위 밴드: 충전 light / band1 성공 success /
  //   band2 성공 celebration / 소실 heavy
  enhanceCharge:      "light",
  enhanceSuccessHigh: "success",
  enhanceSuccessMax:  "celebration",
  enhanceShatter:     "heavy",
};

/**
 * 선택 햅틱 세션 — 연속 틱(문지르기 등)을 위한 start/end 괄호.
 *
 * 네이티브(Capacitor): selectionStart() 로 제너레이터를 준비해 두면 이후
 * `triggerHaptic("select")` 가 selectionChanged() 만 울린다(iOS Haptics.prepare(.selection)
 * + 반복 .selection 재생과 같은 효과). 세션 밖에서는 changed 가 no-op 라 단발 호출은
 * triggerNativeHaptic 이 start/changed/end 를 스스로 감싼다.
 *
 * 비네이티브(TWA/PWA, navigator.vibrate): 세션 중 `triggerHaptic("select")` 는
 * 60ms 당 최대 1회 `vibrate(10)` 만 보낸다. 평소 경로의 vibrate(0) 리셋과
 * MIN_VIBRATION_MS(25) 클램프를 거치면 40ms 틱마다 25ms 진동이 다음 틱의 리셋에
 * 잘려 뭉개진 한 덩어리로 느껴진다. 짧고 잘리지 않는 틱이 "사각사각"에 가깝다.
 */
let selectionSessionOpen = false;
/** 비네이티브 세션 틱 스로틀 기준 시각(performance.now) */
let lastSelectionVibrateAt = -Infinity;
const SELECTION_VIBRATE_MIN_GAP_MS = 60;
const SELECTION_VIBRATE_MS = 10;

/**
 * Capacitor Haptics 모듈은 한 번만 동적 import 한다. 40ms 틱마다 import() 를
 * 새로 부르면 매 틱이 모듈 로더를 거치고, 동시에 들어온 틱끼리 순서가 뒤섞인다.
 */
let hapticsModule: Promise<typeof import("@capacitor/haptics")> | null = null;
function loadHaptics(): Promise<typeof import("@capacitor/haptics")> {
  hapticsModule ??= import("@capacitor/haptics");
  return hapticsModule;
}

export function beginSelectionHaptics(): void {
  selectionSessionOpen = true;
  lastSelectionVibrateAt = -Infinity;
  if (!isNative()) return;
  void loadHaptics()
    .then(({ Haptics }) => Haptics.selectionStart())
    .catch(() => { /* non-critical */ });
}

export function endSelectionHaptics(): void {
  selectionSessionOpen = false;
  if (!isNative()) return;
  void loadHaptics()
    .then(({ Haptics }) => Haptics.selectionEnd())
    .catch(() => { /* non-critical */ });
}

/** 테스트 전용 — 모듈 상태 초기화 */
export function __resetSelectionHapticsForTests(): void {
  selectionSessionOpen = false;
  lastSelectionVibrateAt = -Infinity;
}

async function triggerNativeHaptic(intent: HapticIntent): Promise<void> {
  try {
    const { Haptics, ImpactStyle, NotificationType } = await loadHaptics();

    switch (intent) {
      case "selection":
        if (selectionSessionOpen) {
          await Haptics.selectionChanged();
        } else {
          // 세션 밖의 단발 선택 틱 — start 없이는 changed 가 무음이라 스스로 감싼다.
          await Haptics.selectionStart();
          await Haptics.selectionChanged();
          await Haptics.selectionEnd();
        }
        return;
      case "light":
        await Haptics.impact({ style: ImpactStyle.Light });
        return;
      case "medium":
        await Haptics.impact({ style: ImpactStyle.Medium });
        return;
      case "heavy":
        await Haptics.impact({ style: ImpactStyle.Heavy });
        return;
      case "success":
        await Haptics.notification({ type: NotificationType.Success });
        return;
      case "warning":
        await Haptics.notification({ type: NotificationType.Warning });
        return;
      case "celebration":
        // Heavy 충격 + 100ms 후 Success → "꽝!" 다음 "팡팡팡" 패턴
        // setTimeout 안 잡고 두 호출 사이에 await 짧게 걸어 약간 더 자연스럽게
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await new Promise((r) => setTimeout(r, 110));
        await Haptics.notification({ type: NotificationType.Success });
        return;
      case "rigid":
        // Capacitor 에 rigid 가 없다. 짧고 단단한 느낌은 Heavy 가 가장 가깝다.
        await Haptics.impact({ style: ImpactStyle.Heavy });
        return;
      case "double":
        await Haptics.impact({ style: ImpactStyle.Medium });
        await new Promise((r) => setTimeout(r, 90));
        await Haptics.impact({ style: ImpactStyle.Medium });
        return;
      case "triple":
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await new Promise((r) => setTimeout(r, 90));
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await new Promise((r) => setTimeout(r, 90));
        await Haptics.notification({ type: NotificationType.Success });
        return;
    }
  } catch { /* non-critical */ }
}

export function triggerHaptic(name: SoundName): void {
  // iOS 네이티브(Capacitor WKWebView): 명시적 intent → UIFeedbackGenerator 경로
  if (isNative()) {
    const intent = HAPTIC_INTENT[name];
    if (!intent) return;
    void triggerNativeHaptic(intent);
    return;
  }

  // 웹/안드로이드(TWA): navigator.vibrate (iOS Safari에선 무시됨)
  const pattern = VIBRATION_PATTERNS[name];
  if (!pattern) return;
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    // 선택 세션 중의 선택 틱 — 리셋·클램프 없이 짧은 진동을 60ms 당 1회만.
    if (selectionSessionOpen && HAPTIC_INTENT[name] === "selection") {
      const now = performance.now();
      if (now - lastSelectionVibrateAt < SELECTION_VIBRATE_MIN_GAP_MS) return;
      lastSelectionVibrateAt = now;
      try { navigator.vibrate(SELECTION_VIBRATE_MS); } catch { /* non-critical */ }
      return;
    }
    try {
      const normalized = normalizePattern(pattern);
      // vibrate(0)으로 이전 패턴을 취소한 뒤 약간의 딜레이를 두고 새 패턴 실행
      // Samsung 구형 기기(Note9 등)에서 취소 직후 실행 시 무시되는 이슈 방지
      navigator.vibrate(0);
      setTimeout(() => {
        try { navigator.vibrate(normalized); } catch { /* non-critical */ }
      }, 10);
    } catch { /* non-critical */ }
  }
}
