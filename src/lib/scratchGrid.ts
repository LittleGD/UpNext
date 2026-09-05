/**
 * 문지르기 의식의 격자 기하와 임계치 — 순수 함수, React 없음.
 *
 * 값은 iOS `AuraRitualCover`(AuraReadingView.swift)와 같은 튜플이다:
 * cols 7 / rows 5 / threshold 0.45 / almost 0.28 / nearTickRatio 0.8 /
 * tickMinInterval 0.04 / tickMinDistance 24 / finish delay 0.26.
 * 한쪽을 바꾸면 다른 쪽도 같이 바꿔야 한다(scratchGrid.test.ts 의 픽스처가 잠근다).
 */

export const SCRATCH_COLS = 7;
export const SCRATCH_ROWS = 5;
export const SCRATCH_TOTAL = SCRATCH_COLS * SCRATCH_ROWS;

/** 이 비율만큼 지나가면 공개. 낮으면 의식이 안 되고, 높으면 노동이 된다. */
export const REVEAL_RATIO = 0.45;
/** 안내 문구가 "조금만 더" 로 바뀌는 지점 */
export const ALMOST_RATIO = 0.28;
/** 공개 임계 대비 이 비율(80%)을 넘으면 한 단계 무거운 틱으로 "임박"을 알린다. */
export const NEAR_TICK_RATIO = 0.8;

/** 문지르기 틱 최소 간격(ms). 이보다 잦으면 진동이 뭉개져 소음이 된다. */
export const TICK_MIN_MS = 40;
/** 틱 하나가 요구하는 이동 거리(px). 시간·거리 둘 다 채워야 틱이 나간다. */
export const TICK_MIN_DIST = 24;

/** 임계 도달 뒤 남은 칸이 걷히는 시간 — 그 뒤에 onReveal (iOS finish 0.26). */
export const PEEL_MS = 260;
/** reduced-motion 의 peel 지연 (iOS 0.02) */
export const PEEL_REDUCED_MS = 20;
/** 안내 문구 페이드 기울기 — `opacity = max(0, 1 - ratio * HINT_FADE_SLOPE)` */
export const HINT_FADE_SLOPE = 1.8;

/** 공개에 필요한 칸 수(실수). 35 * 0.45 = 15.75 → 16칸부터 공개. */
export function revealGoal(): number {
  return SCRATCH_TOTAL * REVEAL_RATIO;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * 격자 안 좌표(x, y; 루트 기준 px) → 셀 인덱스. 바깥 좌표는 가장자리 셀로 클램프한다.
 * 포인터 캡처 중에는 손가락이 격자 밖으로 나가도 이벤트가 계속 오므로,
 * 버리지 않고 가장 가까운 가장자리 칸을 문지른 것으로 친다.
 */
export function cellIndexAt(x: number, y: number, width: number, height: number): number {
  const col = clamp(Math.floor((x / width) * SCRATCH_COLS), 0, SCRATCH_COLS - 1);
  const row = clamp(Math.floor((y / height) * SCRATCH_ROWS), 0, SCRATCH_ROWS - 1);
  return row * SCRATCH_COLS + col;
}

/**
 * 두 포인터 샘플 사이를 보간해 지나간 셀을 모두 `out` 에 넣는다.
 * 스텝은 작은 쪽 셀 크기의 절반 — 어떤 속도의 스와이프에서도 샘플 사이 칸이
 * 건너뛰어지지 않는다(반 셀보다 촘촘하면 같은 칸을 두 번 볼 뿐 놓치는 칸은 없다).
 */
export function cellsAlongSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
  out: Set<number>,
): void {
  if (width <= 0 || height <= 0) return;
  const cellMin = Math.min(width / SCRATCH_COLS, height / SCRATCH_ROWS);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (cellMin * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.add(cellIndexAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width, height));
  }
}

/** 임박 구간 — 목표의 80% 이상, 목표 미만. 13칸부터 15칸까지 true. */
export function isNearTick(count: number): boolean {
  const goal = revealGoal();
  return count >= goal * NEAR_TICK_RATIO && count < goal;
}

/** 공개 임계 도달 — 16칸부터 true. */
export function isRevealed(count: number): boolean {
  return count >= revealGoal();
}
