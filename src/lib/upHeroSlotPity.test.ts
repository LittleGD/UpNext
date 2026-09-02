import { describe, it, expect } from "vitest";
import {
  SLOT_OUTCOMES,
  SLOT_PITY_THRESHOLD,
  SLOT_BLANK_STREAK_MAX,
  SLOT_SPIN_COST,
  rollSlotOutcome,
  normalizeSlotBlankStreak,
  isSlotPityArmed,
  nextSlotBlankStreak,
  slotRtp,
  slotWinRate,
  slotExpectedValue,
  type SlotOutcomeId,
} from "./upHeroSlot";
import { createRng } from "./upHeroRng";

/**
 * 굴림틀 pity 영속화 — 롤 층위 계약.
 *
 * 예전 pity 는 죽어 있었다: 스트릭이 세션 스코프였고 세션당 상한이 3 이라
 * 임계 5 에 닿을 수 없었다. 지금은 `UpHeroState.slotBlankStreak` 이 진실이고
 * 이 파일은 그 값을 롤에 물렸을 때의 규칙을 못박는다.
 *
 *  - 4연속 꽝 뒤 5번째는 반드시 보상 (꽝을 뺀 표로 재정규화)
 *  - 보상이면 0, 꽝이면 +1
 *  - 손상 값은 정수 [0, 1000] 으로 접힌다
 *  - 실효 RTP: 원시 92.75% → pity 포함 약 95.4% (200k 스핀 시뮬레이션)
 */

const VALUE_OF: Record<SlotOutcomeId, number> = Object.fromEntries(
  SLOT_OUTCOMES.map((o) => [o.id, o.value]),
) as Record<SlotOutcomeId, number>;

/**
 * pity 포함 정상 상태 해석값. 스트릭 k(0..4)에 머무는 비율 π_k ∝ q^k (q = 꽝 확률),
 * 스트릭 4 에서는 꽝 확률 0. 실효 보상 확률 = p + q·π_4, 실효 EV = 그 확률 × (보상
 * 조건부 평균가). 시뮬레이션이 이 값에 수렴하는지 본다.
 */
function analyticPity() {
  const p = slotWinRate();
  const q = 1 - p;
  const weights = Array.from({ length: SLOT_PITY_THRESHOLD }, (_, k) => q ** k);
  const total = weights.reduce((a, b) => a + b, 0);
  const piArmed = weights[SLOT_PITY_THRESHOLD - 1] / total;
  const winRate = p + q * piArmed;
  const evGivenWin = slotExpectedValue() / p;
  return { winRate, rtp: (winRate * evGivenWin) / SLOT_SPIN_COST, piArmed };
}

describe("normalizeSlotBlankStreak — 관용 디코드", () => {
  it("레거시(필드 없음)·타입 불일치·NaN 은 0", () => {
    expect(normalizeSlotBlankStreak(undefined)).toBe(0);
    expect(normalizeSlotBlankStreak(null)).toBe(0);
    expect(normalizeSlotBlankStreak("4")).toBe(0);
    expect(normalizeSlotBlankStreak(NaN)).toBe(0);
    expect(normalizeSlotBlankStreak(Infinity)).toBe(0);
  });

  it("음수는 0, 소수는 내림, 상한 초과는 1000", () => {
    expect(normalizeSlotBlankStreak(-3)).toBe(0);
    expect(normalizeSlotBlankStreak(2.9)).toBe(2);
    expect(normalizeSlotBlankStreak(1e9)).toBe(SLOT_BLANK_STREAK_MAX);
    expect(SLOT_BLANK_STREAK_MAX).toBe(1000);
  });

  it("정상 값은 그대로", () => {
    for (let k = 0; k <= 4; k += 1) expect(normalizeSlotBlankStreak(k)).toBe(k);
  });
});

describe("isSlotPityArmed / nextSlotBlankStreak", () => {
  it("스트릭 4 부터 pity 가 걸린다 (임계 5 의 직전)", () => {
    expect(SLOT_PITY_THRESHOLD).toBe(5);
    expect(isSlotPityArmed(0)).toBe(false);
    expect(isSlotPityArmed(3)).toBe(false);
    expect(isSlotPityArmed(4)).toBe(true);
    expect(isSlotPityArmed(1000)).toBe(true);
    // 손상 값은 접힌 뒤 판정한다.
    expect(isSlotPityArmed(NaN)).toBe(false);
    expect(isSlotPityArmed(-1)).toBe(false);
  });

  it("보상이면 0, 꽝이면 +1, 상한에서 멈춘다", () => {
    expect(nextSlotBlankStreak(0, "blank")).toBe(1);
    expect(nextSlotBlankStreak(3, "blank")).toBe(4);
    for (const o of SLOT_OUTCOMES) {
      if (o.id === "blank") continue;
      expect(nextSlotBlankStreak(4, o.id)).toBe(0);
    }
    expect(nextSlotBlankStreak(SLOT_BLANK_STREAK_MAX, "blank")).toBe(SLOT_BLANK_STREAK_MAX);
    // 레거시 undefined 를 받아도 NaN 이 되지 않는다.
    expect(nextSlotBlankStreak(undefined as unknown as number, "blank")).toBe(1);
  });
});

describe("rollSlotOutcome — pity 입력", () => {
  it("같은 난수라도 스트릭 4 에서는 꽝이 보상으로 바뀐다", () => {
    // 0.1 은 원시 표에서 꽝(0..490) 구간. pity 표(510)에서는 51 → coinSmall.
    expect(rollSlotOutcome(0, () => 0.1)).toBe("blank");
    expect(rollSlotOutcome(SLOT_PITY_THRESHOLD - 1, () => 0.1)).toBe("coinSmall");
  });

  it("손상된 스트릭 입력도 터지지 않는다", () => {
    expect(() => rollSlotOutcome(NaN, () => 0.1)).not.toThrow();
    expect(rollSlotOutcome(NaN, () => 0.1)).toBe("blank");
    expect(rollSlotOutcome(1e9, () => 0.1)).not.toBe("blank");
  });
});

describe("pity 실효성 — 200k 스핀 시뮬레이션", () => {
  const N = 200_000;

  function simulate(persistStreak: boolean, seed: number) {
    const r = createRng(seed);
    let streak = 0;
    let maxStreak = 0;
    let wins = 0;
    let armedSpins = 0;
    let armedBlanks = 0;
    let paid = 0;
    for (let i = 0; i < N; i += 1) {
      const armed = isSlotPityArmed(streak);
      if (armed) armedSpins += 1;
      const outcome = rollSlotOutcome(persistStreak ? streak : 0, r);
      if (outcome !== "blank") wins += 1;
      else if (armed) armedBlanks += 1;
      paid += VALUE_OF[outcome];
      streak = persistStreak ? nextSlotBlankStreak(streak, outcome) : 0;
      maxStreak = Math.max(maxStreak, streak);
    }
    return {
      rtp: paid / (N * SLOT_SPIN_COST),
      winRate: wins / N,
      maxStreak,
      armedSpins,
      armedBlanks,
    };
  }

  it("스트릭이 영속하면 5번째는 절대 꽝이 아니고 스트릭은 4 를 넘지 않는다", () => {
    const sim = simulate(true, 20260901);
    expect(sim.armedSpins).toBeGreaterThan(0);
    expect(sim.armedBlanks).toBe(0);
    expect(sim.maxStreak).toBe(SLOT_PITY_THRESHOLD - 1);
  });

  it("실효 RTP 는 원시 92.75% 에서 약 95.4% 로 오른다 — 해석값과 일치", () => {
    const { rtp, winRate } = analyticPity();
    // 해석값 자체가 스펙 수치와 맞는지 먼저 고정한다.
    expect(rtp).toBeCloseTo(0.9545, 3);
    expect(winRate).toBeCloseTo(0.5248, 3);

    const sim = simulate(true, 20260901);
    expect(Math.abs(sim.rtp - rtp)).toBeLessThan(0.006);
    expect(Math.abs(sim.winRate - winRate)).toBeLessThan(0.005);
    expect(sim.rtp).toBeGreaterThan(slotRtp());
  });

  it("스트릭을 안 물리면 원시 RTP 그대로다 — 예전 죽은 pity 의 실효값", () => {
    const sim = simulate(false, 20260901);
    expect(Math.abs(sim.rtp - slotRtp())).toBeLessThan(0.006);
    expect(Math.abs(sim.winRate - slotWinRate())).toBeLessThan(0.005);
  });

  it("공개 확률표(slotRtp/slotWinRate)는 pity 와 무관하게 원시 표다", () => {
    expect(slotRtp()).toBeCloseTo(0.9275, 6);
    expect(slotWinRate()).toBeCloseTo(0.51, 6);
  });
});
