/**
 * Up Hero — Idle accrual (오프라인 수련).
 *
 * Phase 5b.1: 사용자가 앱을 닫고 N 분 뒤 다시 열면, 그 사이 영웅이 "수련"
 * 했다고 간주해 XP 와 코인을 일부 지급. 방치형 RPG 의 promise 이행.
 *
 * 설계:
 * - 기본 XP 0.5/분, 코인 0.3/분
 * - Lv 에 따라 완만히 scale (Lv 10 은 Lv1 의 1.5 배)
 * - Cap 8시간 (480분 = 기본 240 XP + 144 coin) — 하루 종일 비워두면 상한.
 * - Minimum 5분 — 앱 잠깐 포그라운드 벗어남 / 새로고침 방지.
 */

export interface IdleReward {
  /** 지급된 XP (소수점 없음, round) */
  xp: number;
  /** 지급된 코인 (round) */
  coins: number;
  /** 실제 반영된 경과 시간 (분, cap 적용 후) */
  elapsedMin: number;
  /** 사용자에게 보여줄 raw 경과 시간 (분, cap 미적용) — "지난 12시간" 같은 표기용 */
  rawElapsedMin: number;
}

const XP_PER_MIN = 0.5;
const COINS_PER_MIN = 0.3;
const MIN_ELAPSED_MIN = 5;
const MAX_ELAPSED_MIN = 8 * 60; // 8시간

/**
 * Phase 14 security — 시스템 시계 rewind 허용 여유 (ms).
 * NTP 미세 조정 / DST 변경 / 타임존 (실제로 Date.now() 는 UTC 라 영향 없음) 등
 * 합법적인 clock 소폭 후퇴를 허용. 이보다 크면 사용자의 의도적 조작으로 간주.
 */
const CLOCK_REWIND_TOLERANCE_MS = 60_000;

/**
 * 경과 시간 (ms) 이 유효한지 (= clock rewind 가 아닌지) 검증.
 *
 * `lastSeenAt` 은 직전 앱 활성 시 기록된 wall-clock. 현재 `now` 가 그보다 크게
 * 과거라면 사용자가 시스템 시계를 되돌렸다는 의미 → idle reward grinding 방지
 * 위해 reward 지급 skip 시그널로 사용.
 *
 * `lastIdleAt` 에 대해서도 동일 — 마지막 accrual 이 미래 시점이면 clock rewind.
 */
export function detectClockRewind(
  now: number,
  lastSeenAt: number | undefined,
  lastIdleAt: number,
): boolean {
  if (lastSeenAt != null && now < lastSeenAt - CLOCK_REWIND_TOLERANCE_MS) {
    return true;
  }
  if (now < lastIdleAt - CLOCK_REWIND_TOLERANCE_MS) {
    return true;
  }
  return false;
}

/**
 * 경과 시간 (ms) + 영웅 level 기반 누적 보상 계산.
 * 최소 5분 미만은 null 반환 (지급 없음 + UI 무시).
 */
export function calculateIdleReward(
  elapsedMs: number,
  level: number,
): IdleReward | null {
  const rawMin = Math.max(0, Math.floor(elapsedMs / 60_000));
  if (rawMin < MIN_ELAPSED_MIN) return null;

  const capped = Math.min(MAX_ELAPSED_MIN, rawMin);
  // level scale: Lv1 은 1.0, Lv10 은 1.5, Lv30 은 2.5, Lv50 은 3.5.
  // 선형이라 단순: 1 + (level - 1) / 20 대략.
  const levelMult = 1 + Math.max(0, level - 1) / 20;

  return {
    xp: Math.round(capped * XP_PER_MIN * levelMult),
    coins: Math.round(capped * COINS_PER_MIN * levelMult),
    elapsedMin: capped,
    rawElapsedMin: rawMin,
  };
}

/** "지난 1시간 20분" 포맷. 60분 미만은 "N분" 만. 한국어 fallback. */
export function formatElapsed(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/**
 * Phase 13 review — 다국어 elapsed 포맷.
 *   t 함수를 받아 i18n key 로 {h}시간 {m}분 조립. 컴포넌트에서 호출.
 *   formatElapsed 는 legacy (store / ko default) 용도로 유지.
 */
export function formatElapsedI18n(
  min: number,
  t: (
    key: import("@/i18n").DictKey,
    params?: Record<string, string | number>,
  ) => string,
): string {
  if (min < 60) return t("uphero.idle.elapsed.minOnly", { min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return t("uphero.idle.elapsed.hourOnly", { h });
  return t("uphero.idle.elapsed.hourMin", { h, m });
}
