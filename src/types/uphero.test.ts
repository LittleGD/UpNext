import { describe, it, expect } from "vitest";
import {
  enhanceSuccessRate,
  enhanceCost,
  computeStatMax,
} from "./uphero";

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
