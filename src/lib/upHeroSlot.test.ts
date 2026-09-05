import { describe, it, expect } from "vitest";
import {
  SLOT_OUTCOMES,
  SLOT_WEIGHT_TOTAL,
  SLOT_SPIN_COST,
  SLOT_GRANTS,
  SLOT_PITY_THRESHOLD,
  DESTROY_GUARD_SHADOW_VALUE,
  DOWN_GUARD_VALUE,
  rollSlotOutcome,
  renderSymbols,
  isNearMiss,
  hasReelSuspense,
  reelTimings,
  suspenseTickTimes,
  slotTier,
  SLOT_CELEBRATION_TIER,
  SLOT_NEAR_MISS_RATE,
  REEL_BASE_STOP_MS,
  REEL_SUSPENSE_EXTRA_MS,
  slotExpectedValue,
  slotRtp,
  slotWinRate,
  slotOdds,
  isSlotWin,
  type SlotOutcomeId,
} from "./upHeroSlot";
import { createRng } from "./upHeroRng";

describe("upHeroSlot — 테이블 계약", () => {
  it("가중치 합계는 정확히 1000", () => {
    const total = SLOT_OUTCOMES.reduce((s, o) => s + o.weight, 0);
    expect(total).toBe(SLOT_WEIGHT_TOTAL);
  });

  it("결과 id 는 중복되지 않는다", () => {
    const ids = SLOT_OUTCOMES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 결과가 지급 정의를 가진다", () => {
    for (const o of SLOT_OUTCOMES) {
      expect(SLOT_GRANTS[o.id]).toBeDefined();
    }
  });

  it("방지권 지급 장수 × 기준가 = 표의 value — 회계가 어긋나면 깨진다", () => {
    const destroy = SLOT_GRANTS.destroyProtect;
    if (destroy.kind !== "destroyGuards") throw new Error("unreachable");
    const destroyValue =
      SLOT_OUTCOMES.find((o) => o.id === "destroyProtect")?.value ?? 0;
    expect(destroy.count * DESTROY_GUARD_SHADOW_VALUE).toBe(destroyValue);

    const down = SLOT_GRANTS.rankProtect;
    if (down.kind !== "downGuards") throw new Error("unreachable");
    const downValue =
      SLOT_OUTCOMES.find((o) => o.id === "rankProtect")?.value ?? 0;
    expect(down.count * DOWN_GUARD_VALUE).toBe(downValue);
  });

  it("RTP 는 92.75%, 보상 확률은 51%", () => {
    expect(slotExpectedValue()).toBeCloseTo(92.75, 6);
    expect(slotRtp()).toBeCloseTo(0.9275, 6);
    expect(slotWinRate()).toBeCloseTo(0.51, 6);
  });

  it("비용보다 기대값이 낮다 — 무한 코인 펌프가 아니다", () => {
    expect(slotExpectedValue()).toBeLessThan(SLOT_SPIN_COST);
  });

  it("확률 합계는 1", () => {
    const sum = Object.values(slotOdds()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("upHeroSlot — 롤", () => {
  it("경계 난수는 표 순서대로 각 구간에 떨어진다", () => {
    // 누적 경계 바로 안쪽을 찍어 구간 매핑을 고정.
    const bounds: Array<[number, SlotOutcomeId]> = [];
    let acc = 0;
    for (const o of SLOT_OUTCOMES) {
      const lo = acc / SLOT_WEIGHT_TOTAL;
      acc += o.weight;
      bounds.push([lo + 1e-9, o.id]);
    }
    for (const [r, id] of bounds) {
      expect(rollSlotOutcome(0, () => r)).toBe(id);
    }
  });

  it("난수 1 로 밀어도 마지막 결과로 안전 착지", () => {
    expect(rollSlotOutcome(0, () => 0.999999999)).toBe("battleBuff");
  });

  it("시드가 같으면 같은 수열이 나온다", () => {
    const a = Array.from({ length: 50 }, () => 0);
    const ra = createRng(4242);
    const rb = createRng(4242);
    const seqA = a.map(() => rollSlotOutcome(0, ra));
    const seqB = a.map(() => rollSlotOutcome(0, rb));
    expect(seqA).toEqual(seqB);
  });

  it("대량 샘플의 실측 분포가 표와 일치", () => {
    const r = createRng(20260831);
    const counts: Record<string, number> = {};
    const N = 200_000;
    for (let i = 0; i < N; i += 1) {
      const id = rollSlotOutcome(0, r);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const o of SLOT_OUTCOMES) {
      const observed = (counts[o.id] ?? 0) / N;
      const expected = o.weight / SLOT_WEIGHT_TOTAL;
      // 절대 오차 0.5%p — 200k 샘플이면 넉넉히 통과하되 표가 바뀌면 깨진다.
      expect(Math.abs(observed - expected)).toBeLessThan(0.005);
    }
  });

  it("pity: 임계 직전 스트릭이면 꽝이 나오지 않는다", () => {
    const r = createRng(7);
    for (let i = 0; i < 5_000; i += 1) {
      expect(rollSlotOutcome(SLOT_PITY_THRESHOLD - 1, r)).not.toBe("blank");
    }
  });

  it("pity 발동 시에도 보상 종류의 상대 비율은 표 그대로", () => {
    const r = createRng(99);
    const counts: Record<string, number> = {};
    const N = 100_000;
    for (let i = 0; i < N; i += 1) {
      const id = rollSlotOutcome(SLOT_PITY_THRESHOLD - 1, r);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    const winTotal = SLOT_OUTCOMES.filter((o) => o.id !== "blank").reduce(
      (s, o) => s + o.weight,
      0,
    );
    for (const o of SLOT_OUTCOMES) {
      if (o.id === "blank") continue;
      const observed = (counts[o.id] ?? 0) / N;
      expect(Math.abs(observed - o.weight / winTotal)).toBeLessThan(0.006);
    }
  });

  it("스트릭이 임계에 못 미치면 꽝도 나온다", () => {
    const r = createRng(11);
    let blanks = 0;
    for (let i = 0; i < 2_000; i += 1) {
      if (rollSlotOutcome(SLOT_PITY_THRESHOLD - 2, r) === "blank") blanks += 1;
    }
    expect(blanks).toBeGreaterThan(0);
  });
});

describe("upHeroSlot — 드럼 표시 (near-miss 는 표시 전용)", () => {
  it("(a) 보상은 언제나 같은 룬 3개, nearMiss = false", () => {
    for (const o of SLOT_OUTCOMES) {
      if (!isSlotWin(o.id)) continue;
      const r = createRng(1);
      for (let i = 0; i < 500; i += 1) {
        const { symbols, nearMiss } = renderSymbols(o.id, r);
        expect(symbols).toEqual([o.symbol, o.symbol, o.symbol]);
        expect(nearMiss).toBe(false);
      }
    }
  });

  it("(b) 꽝의 near-miss 비율은 30% ± 2pp (10만 렌더), 배치 A:B ≈ 8:2", () => {
    // 10만 렌더는 xcodebuild 와 병렬로 돌 때 기본 5s 를 넘긴다(3회 관측). 시드 고정이라 결과는 결정론적.
    const r = createRng(31337);
    const N = 100_000;
    let near = 0;
    let variantA = 0;
    for (let i = 0; i < N; i += 1) {
      const { symbols, nearMiss } = renderSymbols("blank", r);
      // 꽝은 어떤 그림이든 3개가 모두 같아질 수 없다 — 화면이 결과와 모순되지 않는다.
      expect(new Set(symbols).size).toBeGreaterThan(1);
      // 플래그와 그림이 항상 일치한다 — 페이로드엔 symbols 만 실리므로 UI 가 되짚는다.
      expect(isNearMiss(symbols)).toBe(nearMiss);
      if (nearMiss) {
        near += 1;
        if (symbols[0] === symbols[1]) variantA += 1;
      } else {
        expect(new Set(symbols).size).toBe(3);
      }
    }
    expect(Math.abs(near / N - SLOT_NEAR_MISS_RATE)).toBeLessThan(0.02);
    expect(Math.abs(variantA / near - 0.8)).toBeLessThan(0.02);
  }, 30_000);

  it("(c) 렌더는 순수 함수 — outcome 을 바꾸지 않고, 같은 난수열이면 같은 그림", () => {
    const ids = SLOT_OUTCOMES.map((o) => o.id);
    for (const id of ids) {
      const a = createRng(2026);
      const b = createRng(2026);
      const seqA = Array.from({ length: 200 }, () => renderSymbols(id, a));
      const seqB = Array.from({ length: 200 }, () => renderSymbols(id, b));
      expect(seqA).toEqual(seqB);
    }
    // 표시 비율은 롤 분포에 아무 영향이 없다: 롤과 렌더를 함께 돌려도 결과 분포는 표 그대로.
    const r = createRng(777);
    const N = 100_000;
    let blanks = 0;
    for (let i = 0; i < N; i += 1) {
      const outcome = rollSlotOutcome(0, r);
      renderSymbols(outcome, r);
      if (outcome === "blank") blanks += 1;
    }
    const blankWeight =
      (SLOT_OUTCOMES.find((o) => o.id === "blank")?.weight ?? 0) / SLOT_WEIGHT_TOTAL;
    expect(Math.abs(blanks / N - blankWeight)).toBeLessThan(0.005);
  });

  it("(d) 릴1·릴2 동일이면 서스펜스 플래그 true, 릴3 만 +700ms", () => {
    const suspense = renderSymbols("coinJackpot", () => 0.5).symbols;
    expect(hasReelSuspense(suspense)).toBe(true);
    expect(reelTimings(suspense)).toEqual([
      REEL_BASE_STOP_MS[0],
      REEL_BASE_STOP_MS[1],
      REEL_BASE_STOP_MS[2] + REEL_SUSPENSE_EXTRA_MS,
    ]);
    expect(reelTimings(suspense)).toEqual([1080, 1240, 2100]);

    // near-miss A (릴1·릴2 같음) 도 같은 서스펜스, B (릴1·릴3 같음) 는 기본 타이밍.
    expect(hasReelSuspense(["gem", "gem", "coin"])).toBe(true);
    expect(hasReelSuspense(["gem", "coin", "gem"])).toBe(false);
    expect(reelTimings(["gem", "coin", "gem"])).toEqual([1080, 1240, 1400]);
    expect(reelTimings(["coin", "gem", "star"])).toEqual([1080, 1240, 1400]);

    // 틱은 릴2 정지 뒤에 시작해 정확히 릴3 착지에서 끝난다. 간격은 벌어진다(감속).
    const ticks = suspenseTickTimes(suspense);
    expect(ticks[0]).toBeGreaterThan(REEL_BASE_STOP_MS[1]);
    expect(ticks[ticks.length - 1]).toBe(2100);
    expect(suspenseTickTimes(["gem", "coin", "gem"])).toEqual([]);
  });

  it("꽝 화면에 'blank' 룬 자체는 그려지지 않는다", () => {
    const r = createRng(5);
    for (let i = 0; i < 2_000; i += 1) {
      for (const s of renderSymbols("blank", r).symbols) {
        expect(s).not.toBe("blank");
      }
    }
  });

  it("축하 티어는 모든 결과에 정의되고 big 은 잭팟·소실방지권만", () => {
    for (const o of SLOT_OUTCOMES) expect(SLOT_CELEBRATION_TIER[o.id]).toBeDefined();
    expect(slotTier("blank")).toBe("none");
    const bigs = SLOT_OUTCOMES.filter((o) => slotTier(o.id) === "big").map((o) => o.id);
    expect(bigs.sort()).toEqual(["coinJackpot", "destroyProtect"]);
  });
});
