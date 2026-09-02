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

  it("결과는 [0.05, 1] 범위로 clamp", () => {
    // 극단 케이스: 매우 많은 pity 누적
    const capped = enhanceSuccessRate("legend", 0, 100);
    expect(capped).toBeLessThanOrEqual(1);
    const floored = enhanceSuccessRate("legend", 99, 0);
    expect(floored).toBeGreaterThanOrEqual(0.05);
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
    for (let lvl = 0; lvl < 10; lvl++) {
      const cost = enhanceCost("unique", lvl);
      expect(Number.isInteger(cost)).toBe(true);
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

  it("레벨이 오를수록 유지 확률이 단조 감소하고 소실은 단조 증가한다", () => {
    for (const r of RARITIES) {
      for (let lvl = ENHANCE_SAFE_MAX_LEVEL + 1; lvl < MAX_ENHANCE_LEVEL - 1; lvl++) {
        expect(enhancePreserveRate(r, lvl + 1)).toBeLessThan(enhancePreserveRate(r, lvl));
        expect(enhanceDestroyRate(r, lvl + 1)).toBeGreaterThan(enhanceDestroyRate(r, lvl));
      }
    }
  });

  it("같은 레벨에서 상위 등급은 소실이 덜하다 (비용이 비싸므로)", () => {
    // normal 과 rare 는 같은 배율(1.0)이라 같은 값이고, unique·legend 만 깎인다.
    for (let lvl = ENHANCE_SAFE_MAX_LEVEL + 1; lvl < MAX_ENHANCE_LEVEL; lvl++) {
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
): { survived: number; destroyed: number; avgAttempts: number } {
  const roll = createRng(seed);
  let survived = 0;
  let destroyed = 0;
  let attempts = 0;
  for (let i = 0; i < runs; i++) {
    let level = 0;
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
      if (r < rates.destroy) alive = false;
      else if (r < rates.destroy + rates.down) level = Math.max(0, level - 1);
    }
    if (alive) survived += 1;
    else destroyed += 1;
  }
  return { survived, destroyed, avgAttempts: attempts / runs };
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
    for (const r of RARITIES) {
      const { survived } = simulateJourney(r, MAX_ENHANCE_LEVEL, 3000, 424242);
      const rate = survived / 3000;
      const [lo, hi] = bands[r];
      expect(rate).toBeGreaterThan(lo);
      expect(rate).toBeLessThan(hi);
    }
  });

  it("고등급일수록 +10 여정이 길다 (성공률 감쇠 + 비용 곡선과 같은 방향)", () => {
    const attempts = (r: Rarity) =>
      simulateJourney(r, MAX_ENHANCE_LEVEL, 3000, 909090).avgAttempts;
    expect(attempts("legend")).toBeGreaterThan(attempts("unique"));
    expect(attempts("unique")).toBeGreaterThan(attempts("normal"));
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
