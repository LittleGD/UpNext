import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Phase 15 통합 — **강화 하락의 stats 왕복 정합성.**
 *
 * 하락(+L → +L-1)은 성공(+L-1 → +L)의 정확한 역연산이어야 한다. 어긋나면
 * 올렸다 내리기를 반복하는 것만으로 스탯이 새거나 불어나는 무한 구멍이 된다.
 * 성공은 applyEnhanceStatGrowth (짝수 ≤10 primary +1, 11..20 매 레벨 +1, +15
 * secondary +2, +20 +3), 하락은 revertEnhanceStatGrowth 이고, 둘 다 같은 선택기
 * (`pickPrimaryStatKey` 최대값 / `pickSecondaryStatKey` 풀 내 최대값, 동률은 정의
 * 순서)를 쓴다. 그래서 왕복이 닫히려면 **올린 뒤에도 같은 키가 뽑혀야** 한다.
 * Phase 5-B — TOP 이 19 로 늘어 등반/하강이 15 의 마일스톤과 11..19 를 가로지른다.
 *
 * 이 파일은 그 성질을 등급·스탯 모양을 바꿔가며 실제 스토어로 확인한다.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore } from "./useUpHeroStore";
import {
  createDefaultHero,
  enhanceOutcomeRates,
  revertEnhanceStatGrowth,
  ENHANCE_SAFE_MAX_LEVEL,
  MAX_ENHANCE_LEVEL,
} from "@/types/uphero";
import type { Equipment } from "@/types/uphero";
import type { Rarity } from "@/types/card";

/** 성공 판정을 반드시 통과시키는 값. */
const ROLL_SUCCEED = 0;
/** 성공 판정을 반드시 실패시키는 값 (성공률은 1 미만). */
const ROLL_FAIL = 0.9999999;

function mockRolls() {
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValue(0.999999);
  return spy;
}

function makeItem(stats: Equipment["stats"], rarity: Rarity = "rare"): Equipment {
  return {
    id: "it-1",
    baseId: "sword_iron",
    name: "쇠검",
    type: "weapon",
    category: "fitness",
    rarity,
    iconName: "Sword",
    stats,
    enhanceLevel: 0,
  } as Equipment;
}

function seed(item: Equipment) {
  useUpHeroStore.setState({
    hero: createDefaultHero(),
    inventory: [item],
    coins: 100_000_000,
    destroyGuards: 0,
    downGuards: 0,
    combatBuff: undefined,
    isLoaded: true,
  });
}

const cur = () => useUpHeroStore.getState().inventory[0];

/** 한 번 성공시킨다. */
function forceSuccess(spy: ReturnType<typeof mockRolls>) {
  spy.mockReturnValueOnce(ROLL_SUCCEED);
  const r = useUpHeroStore.getState().enhanceItem("it-1");
  expect(r.ok).toBe(true);
}

/** 한 번 하락시킨다. 3분기 롤을 그 레벨의 down 구간 한가운데로 떨어뜨린다. */
function forceDown(spy: ReturnType<typeof mockRolls>, rarity: Rarity, level: number) {
  const rates = enhanceOutcomeRates(rarity, level);
  expect(rates.down).toBeGreaterThan(0);
  // Phase 5-B — 19 단 연속 하강은 pity 를 포화(legend +4%p × 16회 → 100%)시켜
  //   ROLL_FAIL 로도 실패시킬 수 없게 된다. 이 파일의 관심사는 스탯 왕복이지 pity 가
  //   아니므로 매 하락 전에 streak 을 0 으로 되돌린다.
  useUpHeroStore.setState({
    inventory: [{ ...cur(), enhanceFailStreak: 0 }],
  });
  spy.mockReturnValueOnce(ROLL_FAIL);
  spy.mockReturnValueOnce(rates.destroy + rates.down / 2);
  const r = useUpHeroStore.getState().enhanceItem("it-1");
  expect(r).toMatchObject({ ok: false, reason: "down" });
}

/** 스탯 객체를 비교 가능한 형태로. */
const snap = (e: Equipment) => JSON.stringify(e.stats);

const SHAPES: Array<[string, Equipment["stats"]]> = [
  ["단일 스탯", { str: 5 }],
  ["동률 2개 (tie-break 경로)", { str: 5, int: 5 }],
  ["뚜렷한 최대값", { str: 3, int: 9, vit: 4 }],
  ["최대값이 정의 순서상 뒤", { str: 2, agi: 7 }],
  ["0 이 섞임", { str: 0, int: 4 }],
  ["전 스탯", { str: 3, int: 3, vit: 3, dex: 3, agi: 3, crit: 3 }],
];

describe("하락 stats 왕복 — 등반 스냅샷과 정확히 일치한다", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const rarity of ["normal", "rare", "unique", "legend"] as Rarity[]) {
    for (const [label, stats] of SHAPES) {
      it(`${rarity} / ${label}`, () => {
        const spy = mockRolls();
        seed(makeItem(stats, rarity));

        // 등반: +0 → +19, 각 레벨의 stats 를 기록한다.
        // +20 까지 올리지 않는 이유는 아래 "최대 레벨은 종착점" 테스트 참고 —
        // +20 에서는 시도 자체가 막혀 하락이 발생할 수 없다.
        const TOP = MAX_ENHANCE_LEVEL - 1;
        expect(TOP).toBe(19);
        const climb: string[] = [snap(cur())];
        const names: string[] = [cur().name];
        for (let L = 0; L < TOP; L += 1) {
          forceSuccess(spy);
          climb.push(snap(cur()));
          names.push(cur().name);
        }
        expect(cur().enhanceLevel).toBe(TOP);

        // 하강: +19 → 안전 구간 경계까지 하락만으로 내려온다 (15 마일스톤 역도 포함).
        // 하락은 안전 구간(0..ENHANCE_SAFE_MAX_LEVEL) 밖에서만 발생하므로
        // 도달 가능한 바닥은 ENHANCE_SAFE_MAX_LEVEL 이다.
        for (let L = TOP; L > ENHANCE_SAFE_MAX_LEVEL; L -= 1) {
          forceDown(spy, rarity, L);
          expect(cur().enhanceLevel).toBe(L - 1);
          expect(snap(cur())).toBe(climb[L - 1]);
          expect(cur().name).toBe(names[L - 1]);
        }
      });
    }
  }
});

describe("무한 이득/손실 구멍 없음", () => {
  afterEach(() => vi.restoreAllMocks());

  it("같은 레벨에서 성공↔하락을 40회 반복해도 스탯이 표류하지 않는다", () => {
    const spy = mockRolls();
    seed(makeItem({ str: 5, int: 5, vit: 2 }, "rare"));
    // 하락이 실제로 굴려지는 레벨까지 올려둔다.
    for (let i = 0; i < 5; i += 1) forceSuccess(spy);
    expect(cur().enhanceLevel).toBe(5);

    const baseline = snap(cur());
    const baseName = cur().name;
    for (let i = 0; i < 40; i += 1) {
      forceSuccess(spy); // +5 → +6
      forceDown(spy, "rare", 6); // +6 → +5
      expect(cur().enhanceLevel).toBe(5);
      expect(snap(cur())).toBe(baseline);
      expect(cur().name).toBe(baseName);
    }
  });

  it("하락이 스탯을 음수로 만들지 않는다", () => {
    const spy = mockRolls();
    // 모든 스탯이 0 인 손상된 저장본. primary 를 뽑아도 뺄 것이 없다.
    seed(makeItem({ str: 0 }, "rare"));
    useUpHeroStore.setState({
      inventory: [{ ...cur(), enhanceLevel: 6, name: "쇠검 +6" }],
    });
    forceDown(spy, "rare", 6);
    expect(cur().stats.str).toBe(0);
    expect(cur().enhanceLevel).toBe(5);
  });

  it("최대 레벨은 종착점 — 시도가 막혀 하락으로 내려올 수 없다", () => {
    const spy = mockRolls();
    seed(makeItem({ str: 5 }, "rare"));
    for (let i = 0; i < MAX_ENHANCE_LEVEL; i += 1) forceSuccess(spy);
    expect(cur().enhanceLevel).toBe(MAX_ENHANCE_LEVEL);
    // 실패 롤을 물려도 시도 자체가 성립하지 않는다. 코인도 빠지지 않는다.
    const before = useUpHeroStore.getState().coins;
    spy.mockReturnValueOnce(ROLL_FAIL);
    expect(useUpHeroStore.getState().enhanceItem("it-1")).toEqual({
      ok: false,
      reason: "maxed",
    });
    expect(useUpHeroStore.getState().coins).toBe(before);
    expect(cur().enhanceLevel).toBe(MAX_ENHANCE_LEVEL);
  });

  it("마일스톤 +15 의 secondary 보너스는 하락에서 정확히 되돌아온다", () => {
    const spy = mockRolls();
    seed(makeItem({ str: 5, dex: 2 }, "rare"));
    for (let i = 0; i < 14; i += 1) forceSuccess(spy);
    expect(cur().enhanceLevel).toBe(14);
    const at14 = snap(cur());
    expect(cur().stats).toEqual({ str: 14, dex: 2 });

    forceSuccess(spy);
    expect(cur().enhanceLevel).toBe(15);
    expect(cur().stats).toEqual({ str: 15, dex: 4 });
    expect(cur().name).toBe("쇠검 +15");

    forceDown(spy, "rare", 15);
    expect(cur().enhanceLevel).toBe(14);
    expect(snap(cur())).toBe(at14);
    expect(cur().name).toBe("쇠검 +14");

    // 다시 올렸다 내리기를 반복해도 표류하지 않는다.
    for (let i = 0; i < 10; i += 1) {
      forceSuccess(spy);
      forceDown(spy, "rare", 15);
      expect(snap(cur())).toBe(at14);
    }
  });

  it("+20 (secondary +3) 도 하락으로 정확히 되돌아온다", () => {
    const spy = mockRolls();
    seed(makeItem({ str: 5, int: 5, vit: 2 }, "legend"));
    for (let i = 0; i < 19; i += 1) forceSuccess(spy);
    const at19 = snap(cur());
    forceSuccess(spy);
    expect(cur().enhanceLevel).toBe(MAX_ENHANCE_LEVEL);
    // +20 은 종착점이라 스토어 하락은 없지만, 헬퍼의 역은 닫혀야 한다.
    expect(JSON.stringify(revertEnhanceStatGrowth(cur().stats, 20))).toBe(at19);
  });

  it("안전 구간에서는 하락 자체가 나오지 않는다", () => {
    for (let L = 0; L <= ENHANCE_SAFE_MAX_LEVEL; L += 1) {
      for (const rarity of ["normal", "rare", "unique", "legend"] as Rarity[]) {
        const rates = enhanceOutcomeRates(rarity, L);
        expect(rates.down).toBe(0);
        expect(rates.destroy).toBe(0);
        expect(rates.keep).toBe(1);
      }
    }
  });
});
