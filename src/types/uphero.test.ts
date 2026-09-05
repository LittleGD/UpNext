import { describe, it, expect } from "vitest";
import {
  enhanceSuccessRate,
  enhanceCost,
  enhancePreserveRate,
  enhanceDestroyRate,
  enhanceDowngradeRate,
  enhanceOutcomeRates,
  canEnhanceDestroy,
  canEnhanceDowngrade,
  isEnhanceSafeLevel,
  computeStatMax,
  ENHANCE_SAFE_MAX_LEVEL,
  MAX_ENHANCE_LEVEL,
  ENHANCE_HIGH_BAND_START,
  ENHANCE_HIGH_MIN_SUCCESS,
  ENHANCE_HIGH_SUCCESS_BY_LEVEL,
  ENHANCE_DESTROY_ON_FAIL_BY_LEVEL,
  ENHANCE_TITLE_LEVELS,
  enhanceCostBandMult,
  getEnhanceTitle,
  enhanceRitualBand,
  pickPrimaryStatKey,
  pickSecondaryStatKey,
  applyEnhanceStatGrowth,
  revertEnhanceStatGrowth,
  enhancePrimaryGrowthTotal,
  stripEnhanceSuffix,
  sellPrice,
  SELL_PRICE,
  SELL_PRICE_BASE,
  NEXT_RARITY,
  INVENTORY_CAP,
  SYNTHESIS_INPUT_COUNT,
} from "./uphero";
import { createRng } from "@/lib/upHeroRng";
import type { Rarity } from "@/types/card";

const RARITIES: Rarity[] = ["normal", "rare", "unique", "legend"];

/**
 * Phase 13 review — 순수 함수 회귀 테스트 첫 배치.
 *   1,700 라인 combat engine 은 stochastic 이라 직접 테스트 어렵지만,
 *   공식 / 경계값 계산 순수 함수는 경제적으로 회귀 보장 가능.
 */

describe("enhanceSuccessRate", () => {
  it("+0 → +1 시도는 base rate 를 반환 (rarity 별)", () => {
    // ENHANCE_BASE_SUCCESS: normal 95, rare 90, unique 75, legend 75 → /100
    expect(enhanceSuccessRate("normal", 0)).toBeCloseTo(0.95, 2);
    expect(enhanceSuccessRate("rare", 0)).toBeCloseTo(0.9, 2);
    expect(enhanceSuccessRate("unique", 0)).toBeCloseTo(0.75, 2);
    expect(enhanceSuccessRate("legend", 0)).toBeCloseTo(0.75, 2);
  });

  it("높은 레벨에서 decay 적용, 최소 0.05 까지만 하락", () => {
    const lvl9 = enhanceSuccessRate("normal", 9);
    expect(lvl9).toBeGreaterThanOrEqual(0.05);
    expect(lvl9).toBeLessThan(enhanceSuccessRate("normal", 0));
  });

  it("pity 보너스는 failStreak 당 가산", () => {
    const base = enhanceSuccessRate("legend", 5, 0);
    const withPity = enhanceSuccessRate("legend", 5, 3);
    expect(withPity).toBeGreaterThan(base);
  });

  it("결과는 상한 1, 하한은 밴드 바닥(0.05 / 상위 밴드 0.01)", () => {
    // 극단 케이스: 매우 많은 pity 누적
    const capped = enhanceSuccessRate("legend", 0, 100);
    expect(capped).toBeLessThanOrEqual(1);
    // Phase 5-B — 표 범위를 넘는 레벨은 +19 로 고정되고 바닥은 1% 다.
    const floored = enhanceSuccessRate("legend", 99, 0);
    expect(floored).toBe(ENHANCE_HIGH_MIN_SUCCESS);
    expect(floored).toBe(enhanceSuccessRate("legend", 19, 0));
  });

  /* ── Phase 5-B — 상위 밴드 (+11..+20) ───────────────────────────────── */

  it("성공률 표 스냅샷 — 0..19 × 4 등급 (0..9 는 바이트 동일)", () => {
    const table: Record<Rarity, number[]> = {
      normal: [95, 92, 89, 86, 83, 80, 77, 74, 71, 68, 50, 40, 31, 24, 18, 13, 9, 5, 3, 1],
      rare: [90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 40, 32, 25, 19, 14, 10, 7, 4, 2, 1],
      unique: [75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 24, 20, 16, 12, 9, 7, 5, 3, 2, 1],
      legend: [75, 68, 61, 54, 47, 40, 33, 26, 19, 12, 12, 10, 8, 6, 5, 4, 3, 2, 2, 1],
    };
    for (const r of RARITIES) {
      for (let lvl = 0; lvl < MAX_ENHANCE_LEVEL; lvl++) {
        expect(enhanceSuccessRate(r, lvl, 0)).toBeCloseTo(table[r][lvl] / 100, 10);
      }
      // 표 상수 자체도 문서와 같아야 한다 (index = level - 10).
      expect([...ENHANCE_HIGH_SUCCESS_BY_LEVEL[r]]).toEqual(
        table[r].slice(ENHANCE_HIGH_BAND_START),
      );
    }
    expect(MAX_ENHANCE_LEVEL).toBe(20);
    expect(ENHANCE_HIGH_BAND_START).toBe(10);
  });

  it("상위 밴드 pity 는 등급 보너스를 대체한다 (normal/rare/unique 2%p, legend 3%p)", () => {
    // legend +19: 1% + 5 × 3%p = 16%
    expect(enhanceSuccessRate("legend", 19, 5)).toBeCloseTo(0.16, 10);
    // normal +19: 1% + 49 × 2%p = 99%, 50 회면 100% 포화
    expect(enhanceSuccessRate("normal", 19, 49)).toBeCloseTo(0.99, 10);
    expect(enhanceSuccessRate("normal", 19, 50)).toBe(1);
    // unique +10: 24% + 3 × 2%p (밴드 밖 0.02 와 같은 값이지만 더하지 않는다)
    expect(enhanceSuccessRate("unique", 10, 3)).toBeCloseTo(0.3, 10);
    // 밴드 밖 (0..9) 은 예전 pity 그대로: legend +9 streak 5 = 12% + 20%p
    expect(enhanceSuccessRate("legend", 9, 5)).toBeCloseTo(0.32, 10);
    expect(enhanceSuccessRate("normal", 9, 5)).toBeCloseTo(0.68, 10);
  });

  it("음수 failStreak 방어", () => {
    const result = enhanceSuccessRate("normal", 0, -5);
    // 음수 pity 는 0 으로 clamp
    expect(result).toBeCloseTo(enhanceSuccessRate("normal", 0, 0), 3);
  });
});

describe("enhanceCost", () => {
  it("+0 → +1 base cost 는 SHOP_PRICES.enhance × rarityMult", () => {
    const normalBase = enhanceCost("normal", 0);
    const legendBase = enhanceCost("legend", 0);
    expect(legendBase).toBeGreaterThan(normalBase);
  });

  it("레벨이 높아질수록 비용 증가 (+50% per level)", () => {
    expect(enhanceCost("normal", 3)).toBeGreaterThan(enhanceCost("normal", 0));
    expect(enhanceCost("normal", 9)).toBeGreaterThan(enhanceCost("normal", 3));
  });

  it("음수 레벨 방어 (min 0)", () => {
    expect(enhanceCost("normal", -5)).toBe(enhanceCost("normal", 0));
  });

  it("결과는 integer (Math.round)", () => {
    for (let lvl = 0; lvl < MAX_ENHANCE_LEVEL; lvl++) {
      const cost = enhanceCost("unique", lvl);
      expect(Number.isInteger(cost)).toBe(true);
    }
  });

  /* ── Phase 5-B — 밴드 배율 (마지막 인자) ─────────────────────────────── */

  it("0..9 비용은 바이트 동일, 10..14 ×1.5, 15..19 ×2", () => {
    const base: Record<Rarity, number[]> = {
      normal: [30, 45, 60, 75, 90, 105, 120, 135, 150, 165],
      rare: [45, 68, 90, 113, 135, 158, 180, 203, 225, 248],
      unique: [75, 113, 150, 188, 225, 263, 300, 338, 375, 413],
      legend: [120, 180, 240, 300, 360, 420, 480, 540, 600, 660],
    };
    for (const r of RARITIES) {
      for (let lvl = 0; lvl < 10; lvl++) expect(enhanceCost(r, lvl)).toBe(base[r][lvl]);
    }
    expect(enhanceCostBandMult(9)).toBe(1);
    expect(enhanceCostBandMult(10)).toBe(1.5);
    expect(enhanceCostBandMult(14)).toBe(1.5);
    expect(enhanceCostBandMult(15)).toBe(2);
    expect(enhanceCostBandMult(19)).toBe(2);
    // 스팟 값 (iOS XCTest 와 같은 픽스처)
    expect(enhanceCost("normal", 10)).toBe(270);
    expect(enhanceCost("rare", 11)).toBe(439);
    expect(enhanceCost("unique", 13)).toBe(844);
    expect(enhanceCost("legend", 19)).toBe(2520);
    // 상위 밴드 전체 표
    const high: Record<Rarity, number[]> = {
      normal: [270, 293, 315, 338, 360, 510, 540, 570, 600, 630],
      rare: [405, 439, 473, 506, 540, 765, 810, 855, 900, 945],
      unique: [675, 731, 788, 844, 900, 1275, 1350, 1425, 1500, 1575],
      legend: [1080, 1170, 1260, 1350, 1440, 2040, 2160, 2280, 2400, 2520],
    };
    for (const r of RARITIES) {
      for (let i = 0; i < 10; i++) expect(enhanceCost(r, 10 + i)).toBe(high[r][i]);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Phase 15 — 실패 3분기(소실 / 하락 / 유지) 곡선.
 *
 * 이 블록은 밸런스의 회귀 방어선이다. 유저 피드백의 출발점이 "+1 → +2 에서도
 * 70% 확률로 아이템이 사라진다" 였으므로, 저강 구간이 다시 위험해지는 변경은
 * 테스트가 먼저 막아야 한다.
 * ══════════════════════════════════════════════════════════════════════ */

describe("enhanceOutcomeRates — 안전 구간", () => {
  it(`currentLevel 0..${ENHANCE_SAFE_MAX_LEVEL} 는 모든 등급에서 소실·하락 확률 0`, () => {
    for (const r of RARITIES) {
      for (let lvl = 0; lvl <= ENHANCE_SAFE_MAX_LEVEL; lvl++) {
        expect(enhanceOutcomeRates(r, lvl)).toEqual({ destroy: 0, down: 0, keep: 1 });
        expect(canEnhanceDestroy(r, lvl)).toBe(false);
        expect(canEnhanceDowngrade(r, lvl)).toBe(false);
        expect(isEnhanceSafeLevel(r, lvl)).toBe(true);
      }
    }
  });

  it("음수·소수 레벨도 안전 구간으로 취급 (방어적 입력)", () => {
    expect(enhancePreserveRate("legend", -3)).toBe(1);
    expect(enhancePreserveRate("normal", 2.7)).toBe(1);
  });
});

describe("enhanceOutcomeRates — 위험 구간", () => {
  it(`currentLevel ${ENHANCE_SAFE_MAX_LEVEL + 1} 부터 소실·하락이 모두 생긴다`, () => {
    for (const r of RARITIES) {
      const lvl = ENHANCE_SAFE_MAX_LEVEL + 1;
      expect(canEnhanceDestroy(r, lvl)).toBe(true);
      expect(canEnhanceDowngrade(r, lvl)).toBe(true);
      expect(isEnhanceSafeLevel(r, lvl)).toBe(false);
    }
  });

  it("3분기 확률의 합은 항상 정확히 1 이고 각 항은 [0,1] 이다", () => {
    for (const r of RARITIES) {
      for (let lvl = 0; lvl <= 30; lvl++) {
        const { destroy, down, keep } = enhanceOutcomeRates(r, lvl);
        for (const p of [destroy, down, keep]) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
        expect(destroy + down + keep).toBeCloseTo(1, 10);
      }
    }
  });

  it("첫 위험 레벨의 소실은 하락보다 훨씬 드물다 (하락이 완충재다)", () => {
    for (const r of RARITIES) {
      const { destroy, down } = enhanceOutcomeRates(r, ENHANCE_SAFE_MAX_LEVEL + 1);
      expect(down).toBeGreaterThan(destroy * 5);
    }
  });

  it("하위 밴드(3..9)에서는 레벨이 오를수록 유지가 단조 감소하고 소실은 단조 증가한다", () => {
    // Phase 5-B — 밴드는 10 에서 의도적으로 꺾인다 (소실 26% → 0). 단조성은 0..9 안에서만.
    for (const r of RARITIES) {
      for (let lvl = ENHANCE_SAFE_MAX_LEVEL + 1; lvl < ENHANCE_HIGH_BAND_START - 1; lvl++) {
        expect(enhancePreserveRate(r, lvl + 1)).toBeLessThan(enhancePreserveRate(r, lvl));
        expect(enhanceDestroyRate(r, lvl + 1)).toBeGreaterThan(enhanceDestroyRate(r, lvl));
      }
    }
  });

  it("같은 레벨에서 상위 등급은 소실이 덜하다 (비용이 비싸므로)", () => {
    // normal 과 rare 는 같은 배율(1.0)이라 같은 값이고, unique·legend 만 깎인다.
    // 기본 소실이 0 인 층(10..14)은 곱해도 0 이라 비교 대상이 아니다.
    for (let lvl = ENHANCE_SAFE_MAX_LEVEL + 1; lvl < MAX_ENHANCE_LEVEL; lvl++) {
      if ((ENHANCE_DESTROY_ON_FAIL_BY_LEVEL[lvl] ?? 0) <= 0) continue;
      const n = enhanceDestroyRate("normal", lvl);
      const r = enhanceDestroyRate("rare", lvl);
      const u = enhanceDestroyRate("unique", lvl);
      const l = enhanceDestroyRate("legend", lvl);
      expect(r).toBe(n);
      expect(u).toBeLessThan(r);
      expect(l).toBeLessThan(u);
    }
  });

  it("하락 확률은 등급과 무관하다", () => {
    for (let lvl = 0; lvl < MAX_ENHANCE_LEVEL; lvl++) {
      const rates = RARITIES.map((r) => enhanceDowngradeRate(r, lvl));
      expect(new Set(rates).size).toBe(1);
    }
  });

  /* ── Phase 5-B — 밴드 단언 ──────────────────────────────────────────── */

  it("중간 밴드 10..14 는 모든 등급에서 소실 0 / 하락 1 / 유지 0", () => {
    for (const r of RARITIES) {
      for (let lvl = ENHANCE_HIGH_BAND_START; lvl < ENHANCE_TITLE_LEVELS.awakened; lvl++) {
        expect(enhanceOutcomeRates(r, lvl)).toEqual({ destroy: 0, down: 1, keep: 0 });
        expect(canEnhanceDestroy(r, lvl)).toBe(false);
        expect(canEnhanceDowngrade(r, lvl)).toBe(true);
        expect(isEnhanceSafeLevel(r, lvl)).toBe(false);
      }
    }
  });

  it("상위 밴드 15..19 는 소실이 단조 상승하고 normal/rare 의 유지는 정확히 0", () => {
    for (const r of RARITIES) {
      for (let lvl = ENHANCE_TITLE_LEVELS.awakened; lvl < MAX_ENHANCE_LEVEL - 1; lvl++) {
        expect(enhanceDestroyRate(r, lvl + 1)).toBeGreaterThan(enhanceDestroyRate(r, lvl));
      }
    }
    for (let lvl = ENHANCE_TITLE_LEVELS.awakened; lvl < MAX_ENHANCE_LEVEL; lvl++) {
      // 1 - 0.7 - 0.3 은 double 에서 5e-17 인데 스냅으로 정확히 0 이어야 한다.
      expect(enhanceOutcomeRates("normal", lvl).keep).toBe(0);
      expect(enhanceOutcomeRates("rare", lvl).keep).toBe(0);
    }
    const l19 = enhanceOutcomeRates("legend", 19);
    expect(l19.destroy).toBeCloseTo(0.49, 10);
    expect(l19.down).toBeCloseTo(0.3, 10);
    expect(l19.keep).toBeCloseTo(0.21, 10);
    expect(enhanceOutcomeRates("unique", 15).destroy).toBeCloseTo(0.255, 10);
    expect(enhanceOutcomeRates("normal", 15)).toEqual({ destroy: 0.3, down: 0.7, keep: 0 });
  });

  it("표 길이는 20 이고 0..9 슬라이스는 예전 값 그대로", () => {
    expect(ENHANCE_DESTROY_ON_FAIL_BY_LEVEL).toHaveLength(20);
    expect(ENHANCE_DESTROY_ON_FAIL_BY_LEVEL.slice(0, 10)).toEqual([
      0, 0, 0, 0.01, 0.02, 0.05, 0.09, 0.14, 0.2, 0.26,
    ]);
    expect(ENHANCE_DESTROY_ON_FAIL_BY_LEVEL.slice(10)).toEqual([
      0, 0, 0, 0, 0, 0.3, 0.4, 0.5, 0.6, 0.7,
    ]);
  });
});

/**
 * 누적 시뮬레이션 — 아이템 하나로 +0 에서 target 까지 올리는 여정을 그대로 돌린다.
 * 성공/실패, pity streak, 3분기 판정까지 스토어(enhanceItem)와 같은 순서·같은
 * 롤 구조로 굴린다. seed 고정이라 결과는 결정론적이다.
 *
 * 하락이 생기면서 여정이 길어질 수 있으므로 무한 루프 방지 상한을 둔다.
 */
function simulateJourney(
  rarity: Rarity,
  target: number,
  runs: number,
  seed: number,
  opts: { startLevel?: number; warded?: boolean } = {},
): { survived: number; reached: number; destroyed: number; avgAttempts: number } {
  const roll = createRng(seed);
  const startLevel = opts.startLevel ?? 0;
  // warded: 소실·하락이 가능한 층에서 그 방지권을 매 시도 건다 (아이템이 움직이지 않는다).
  const warded = opts.warded === true;
  let survived = 0;
  let reached = 0;
  let destroyed = 0;
  let attempts = 0;
  for (let i = 0; i < runs; i++) {
    let level = startLevel;
    let streak = 0;
    let alive = true;
    let guard = 0;
    while (alive && level < target && guard < 5000) {
      guard += 1;
      attempts += 1;
      if (roll() < enhanceSuccessRate(rarity, level, streak)) {
        level += 1;
        streak = 0;
        continue;
      }
      streak += 1;
      const rates = enhanceOutcomeRates(rarity, level);
      const r = roll();
      if (r < rates.destroy) {
        if (!warded) alive = false;
      } else if (r < rates.destroy + rates.down) {
        if (!warded) level = Math.max(0, level - 1);
      }
    }
    if (alive) survived += 1;
    else destroyed += 1;
    if (alive && level >= target) reached += 1;
  }
  return { survived, reached, destroyed, avgAttempts: attempts / runs };
}

describe("누적 강화 여정 회귀", () => {
  it("+0 → +3 은 어떤 등급이든 소실도 하락도 일어나지 않는다", () => {
    // 목표치는 "이하" 가 아니라 정확히 0 이다. 안전 구간의 확률이 0 이므로
    // 이 구간에서 아이템이 사라지려면 곡선이 바뀌는 수밖에 없다.
    for (const r of RARITIES) {
      const { destroyed, survived } = simulateJourney(r, 3, 3000, 20260831);
      expect(destroyed).toBe(0);
      expect(survived).toBe(3000);
    }
  });

  it("+0 → +10 은 여전히 도전 구간이되 도달 가능하다", () => {
    // 개편 전 모델(레벨 무관 고정 보존)에서는 legend 도달률이 0.3% 였다.
    // 밴드를 넓게 잡아 seed 변경에는 둔감하고 곡선 왜곡에는 민감하게 둔다.
    // 20만 회 기준 도달률: normal 73% / rare 56% / unique 28% / legend 10.5%.
    const bands: Record<Rarity, [number, number]> = {
      normal: [0.62, 0.85],
      rare: [0.45, 0.7],
      unique: [0.18, 0.42],
      legend: [0.05, 0.22],
    };
    // Phase 5-B — 목표는 상위 밴드 시작(+10)이다. 0..9 의 값이 바이트 동일한 한
    //   이 밴드는 그대로 통과해야 한다.
    for (const r of RARITIES) {
      const { survived } = simulateJourney(r, ENHANCE_HIGH_BAND_START, 3000, 424242);
      const rate = survived / 3000;
      const [lo, hi] = bands[r];
      expect(rate).toBeGreaterThan(lo);
      expect(rate).toBeLessThan(hi);
    }
  });

  it("고등급일수록 +10 여정이 길다 (성공률 감쇠 + 비용 곡선과 같은 방향)", () => {
    const attempts = (r: Rarity) =>
      simulateJourney(r, ENHANCE_HIGH_BAND_START, 3000, 909090).avgAttempts;
    expect(attempts("legend")).toBeGreaterThan(attempts("unique"));
    expect(attempts("unique")).toBeGreaterThan(attempts("normal"));
  });

  /* ── Phase 5-B — 상위 밴드 여정 ─────────────────────────────────────── */

  it("미방어 +10 → +15 는 어떤 등급이든 소실이 난다 (+9 로 미끄러지면 재노출)", () => {
    // 중간 밴드 자체는 소실 0 이지만, 실패가 100% 하락이라 +9 로 내려가는 순간
    // 하위 밴드의 26% 소실이 다시 붙는다. "안전하다" 가 아니라 "그렇게 끝난다" 를 문서화.
    for (const r of RARITIES) {
      const { destroyed } = simulateJourney(r, 15, 3000, 424242, { startLevel: 10 });
      expect(destroyed).toBeGreaterThan(0);
    }
  });

  it("미방어 +10 → +20 도달률은 0.5% 미만 (+20 은 방지권 경제의 목표다)", () => {
    for (const r of RARITIES) {
      const { reached } = simulateJourney(r, MAX_ENHANCE_LEVEL, 3000, 424242, {
        startLevel: 10,
      });
      expect(reached / 3000).toBeLessThan(0.005);
    }
  });

  it("완전 방어 +10 → +20 은 항상 도달하고 평균 시도 수는 [40, 140]", () => {
    // 기대값 (pity 0.02/0.02/0.02/0.03): normal 50.7 / rare 55.5 / unique 63.2 / legend 63.8.
    for (const r of RARITIES) {
      const { reached, avgAttempts } = simulateJourney(r, MAX_ENHANCE_LEVEL, 2000, 424242, {
        startLevel: 10,
        warded: true,
      });
      expect(reached).toBe(2000);
      expect(avgAttempts).toBeGreaterThanOrEqual(40);
      expect(avgAttempts).toBeLessThanOrEqual(140);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Phase 5-B — 칭호 / 연출 밴드 / 스탯 성장 헬퍼
 * ══════════════════════════════════════════════════════════════════════ */

describe("getEnhanceTitle / enhanceRitualBand", () => {
  it("각성 15..19, 초월 20, 그 외 null", () => {
    expect(getEnhanceTitle(14)).toBeNull();
    expect(getEnhanceTitle(15)).toBe("awakened");
    expect(getEnhanceTitle(19)).toBe("awakened");
    expect(getEnhanceTitle(20)).toBe("transcended");
    expect(getEnhanceTitle(0)).toBeNull();
  });

  it("연출 밴드는 목표 레벨 기준 0 / 1 / 2", () => {
    expect(enhanceRitualBand(10)).toBe(0);
    expect(enhanceRitualBand(1)).toBe(0);
    expect(enhanceRitualBand(11)).toBe(1);
    expect(enhanceRitualBand(15)).toBe(1);
    expect(enhanceRitualBand(16)).toBe(2);
    expect(enhanceRitualBand(20)).toBe(2);
  });
});

describe("applyEnhanceStatGrowth / revertEnhanceStatGrowth", () => {
  it("1..20 정방향: {str:10,dex:3} → {str:25,dex:8}, 역방향 20..1 은 정확히 원본", () => {
    const original = { str: 10, dex: 3 };
    let stats: typeof original & Record<string, number | undefined> = { ...original };
    const snapshots: string[] = [JSON.stringify(stats)];
    for (let L = 1; L <= 20; L++) {
      stats = applyEnhanceStatGrowth(stats, L) as typeof stats;
      snapshots.push(JSON.stringify(stats));
    }
    expect(stats).toEqual({ str: 25, dex: 8 });
    for (let L = 20; L >= 1; L--) {
      stats = revertEnhanceStatGrowth(stats, L) as typeof stats;
      expect(JSON.stringify(stats)).toBe(snapshots[L - 1]);
    }
    expect(stats).toEqual(original);
  });

  it("마일스톤: +15 에서 secondary +2, +20 에서 +3, 그 외 레벨은 primary 만", () => {
    expect(applyEnhanceStatGrowth({ str: 20, dex: 4 }, 15)).toEqual({ str: 21, dex: 6 });
    expect(applyEnhanceStatGrowth({ str: 30, dex: 5 }, 20)).toEqual({ str: 31, dex: 8 });
    expect(applyEnhanceStatGrowth({ str: 20, dex: 4 }, 14)).toEqual({ str: 21, dex: 4 });
    expect(applyEnhanceStatGrowth({ str: 5, dex: 2 }, 9)).toEqual({ str: 5, dex: 2 });
    expect(applyEnhanceStatGrowth({ str: 5, dex: 2 }, 10)).toEqual({ str: 6, dex: 2 });
  });

  it("단일 스탯 장비는 마일스톤 보너스도 primary 로 간다", () => {
    expect(applyEnhanceStatGrowth({ str: 5 }, 15)).toEqual({ str: 8 });
    expect(revertEnhanceStatGrowth({ str: 8 }, 15)).toEqual({ str: 5 });
    expect(applyEnhanceStatGrowth({ crit: 7 }, 20)).toEqual({ crit: 11 });
  });

  it("legend 픽스처 {str:45,crit:7,int:6,vit:6} → secondary 는 int (crit 제외, 동률은 순서)", () => {
    const stats = { str: 45, crit: 7, int: 6, vit: 6 };
    expect(pickPrimaryStatKey(stats)).toBe("str");
    expect(pickSecondaryStatKey(stats, "str")).toBe("int");
    expect(applyEnhanceStatGrowth(stats, 15)).toEqual({ str: 46, crit: 7, int: 8, vit: 6 });
  });

  it("0 아래로 내리지 않는다 (손상된 저장본 방어)", () => {
    expect(revertEnhanceStatGrowth({ str: 0, dex: 1 }, 15)).toEqual({ str: 0, dex: 0 });
  });

  it("enhancePrimaryGrowthTotal = floor(min(L,10)/2) + max(0, L-10)", () => {
    expect(enhancePrimaryGrowthTotal(0)).toBe(0);
    expect(enhancePrimaryGrowthTotal(3)).toBe(1);
    expect(enhancePrimaryGrowthTotal(10)).toBe(5);
    expect(enhancePrimaryGrowthTotal(15)).toBe(10);
    expect(enhancePrimaryGrowthTotal(20)).toBe(15);
    // 정방향 누적과 일치
    for (let target = 0; target <= 20; target++) {
      let s: { str: number } = { str: 0 };
      for (let L = 1; L <= target; L++) s = applyEnhanceStatGrowth(s, L) as { str: number };
      const secondary = target >= 20 ? 5 : target >= 15 ? 2 : 0;
      expect(s.str).toBe(enhancePrimaryGrowthTotal(target) + secondary);
    }
  });

  it("stripEnhanceSuffix", () => {
    expect(stripEnhanceSuffix("자기절제의 검 +3")).toBe("자기절제의 검");
    expect(stripEnhanceSuffix("꾸준함의 방패 +")).toBe("꾸준함의 방패");
    expect(stripEnhanceSuffix("쇠검 +20")).toBe("쇠검");
    expect(stripEnhanceSuffix("쇠검")).toBe("쇠검");
  });
});

describe("computeStatMax", () => {
  it("Lv1 영웅 stat max 는 모두 base (10 + 1 × growth)", () => {
    const max = computeStatMax(1, null);
    expect(max.str).toBeGreaterThan(0);
    expect(max.int).toBeGreaterThan(0);
  });

  it("레벨이 오르면 max 도 증가", () => {
    const lv10 = computeStatMax(10, null);
    const lv50 = computeStatMax(50, null);
    expect(lv50.str).toBeGreaterThan(lv10.str);
  });

  it("warrior 클래스는 str max 가 mage 보다 높음 (주스탯 편향)", () => {
    const warrior = computeStatMax(30, "warrior");
    const mage = computeStatMax(30, "mage");
    expect(warrior.str).toBeGreaterThan(mage.str);
    expect(mage.int).toBeGreaterThan(warrior.int);
  });
});

// Note: computeHeroForLevel / getBuffSlotCount 는 Hero 객체 인자 필요.
//   순수 계산 검증은 enhanceSuccessRate / enhanceCost / computeStatMax 로 충분.
//   Hero-dependent 함수는 차후 fixture 정비 후 테스트 추가.

/**
 * Phase 6-E (Track E) — 인벤토리 경제 상수. iOS UpHeroRules 와 같은 픽스처.
 */
describe("sellPrice (Track E)", () => {
  it.each([
    ["normal", 0, 0, 5],
    ["normal", 30, 0, 35],
    ["rare", 12, 3, 57],
    ["unique", 20, 10, 280],
    ["legend", 30, 10, 840],
    // 층 99 · 강화 20 (MAX_ENHANCE_LEVEL) 으로 clamp: 200 + 8×99 + 40×20.
    ["legend", 120, 25, 1792],
  ] as const)("%s F%i +%i = %i", (rarity, floor, level, expected) => {
    expect(sellPrice(rarity, floor, level)).toBe(expected);
  });

  it("undefined / 음수 / 소수는 0 층·+0 으로 접는다", () => {
    expect(sellPrice("rare", undefined, undefined)).toBe(15);
    expect(sellPrice("rare", -5, -1)).toBe(15);
    expect(sellPrice("rare", 2.9, 1.9)).toBe(15 + 4 + 6);
  });

  it("SELL_PRICE 별칭은 BASE 표와 같고 +0/F0 가격은 예전 그대로", () => {
    expect(SELL_PRICE).toBe(SELL_PRICE_BASE);
    for (const r of ["normal", "rare", "unique", "legend"] as const) {
      expect(sellPrice(r, 0, 0)).toBe(SELL_PRICE_BASE[r]);
    }
  });

  it("NEXT_RARITY / INVENTORY_CAP / SYNTHESIS_INPUT_COUNT", () => {
    expect(NEXT_RARITY).toEqual({ normal: "rare", rare: "unique", unique: "legend", legend: null });
    expect(INVENTORY_CAP).toBe(30);
    expect(SYNTHESIS_INPUT_COUNT).toBe(3);
  });
});
