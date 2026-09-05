import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 15 → 5-B — 강화 실패 3분기 + 방지권 2종 **시도당** 소모 계약 회귀 테스트.
 *
 * 계약은 하나다: **걸린 방지권(보유 > 0, 그 결과가 가능한 레벨)은 결과와 무관하게
 * 이번 시도에서 1장 나간다.** 성공이든 유지든 소실이든 같다. 대신 걸어도 소용없는
 * 곳(보유 0, 소실 0 인 +10..+14, 안전 구간)에서는 나가지 않는다. 이 규칙이 흔들리면
 * 유저는 "켰는데 안 나갔다 / 안 켰는데 나갔다" 를 겪고, 소모품 신뢰가 무너진다.
 * 그래서 소모 매트릭스의 갈래를 모두 못박는다.
 *
 * 저장/동기화는 이 테스트의 관심사가 아니므로 storage 모듈을 통째로 대체한다
 * (실물은 Firestore 로 나가는 syncToCloud 를 물고 있다).
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
  ENHANCE_GUARD_MAX,
  SHOP_PRICES,
  enhanceCost,
  enhanceOutcomeRates,
} from "@/types/uphero";
import type { Equipment } from "@/types/uphero";

/** currentLevel 6 — 안전 구간(0..2) 밖이라 소실·하락 판정이 실제로 굴려지는 레벨. */
const RISK_LEVEL = 6;
/** rare +6: 소실 9% / 하락 30% / 유지 61% (실패했을 때의 조건부 확률). */
const RATES = enhanceOutcomeRates("rare", RISK_LEVEL);

/** 실패 후 outcome roll 을 원하는 갈래로 떨어뜨리는 값. */
const ROLL_DESTROY = RATES.destroy / 2;
const ROLL_DOWN = RATES.destroy + RATES.down / 2;
const ROLL_KEEP = 0.999;
/** 성공 판정을 반드시 실패시키는 값 (성공률은 아무리 높아도 1 미만). */
const ROLL_FAIL = 0.9999999;

function makeItem(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "it-1",
    baseId: "sword_iron",
    name: "쇠검 +6",
    type: "weapon",
    rarity: "rare",
    iconName: "Sword",
    stats: { str: 5 },
    enhanceLevel: RISK_LEVEL,
    ...overrides,
  } as Equipment;
}

/**
 * enhanceItem 은 rng() 를 최대 두 번 굴린다 — 1) 성공 판정 2) 3분기 판정.
 * rng() 는 seed 미설정 시 Math.random 에 위임하므로 시퀀스를 직접 물린다.
 */
function queueRolls(...values: number[]) {
  const spy = vi.spyOn(Math, "random");
  for (const v of values) spy.mockReturnValueOnce(v);
  // 예상 밖의 추가 호출은 "아무것도 적중하지 않는" 값으로 흘려보낸다.
  spy.mockReturnValue(0.999999);
  return spy;
}

function seedStore(
  guards: { destroy?: number; down?: number },
  item: Equipment = makeItem(),
) {
  useUpHeroStore.setState({
    hero: createDefaultHero(),
    inventory: [item],
    coins: 100000,
    destroyGuards: guards.destroy ?? 0,
    downGuards: guards.down ?? 0,
    combatBuff: undefined,
    isLoaded: true,
  });
}

const ARM_BOTH = { destroy: true, down: true };

describe("enhanceItem — 실패 3분기", () => {
  afterEach(() => vi.restoreAllMocks());

  it("소실 구간에서는 아이템이 사라진다", () => {
    seedStore({});
    queueRolls(ROLL_FAIL, ROLL_DESTROY);
    expect(useUpHeroStore.getState().enhanceItem("it-1")).toMatchObject({
      ok: false,
      reason: "destroyed",
    });
    expect(useUpHeroStore.getState().inventory).toHaveLength(0);
  });

  it("하락 구간에서는 한 단계 내려가고 아이템은 남는다", () => {
    seedStore({});
    queueRolls(ROLL_FAIL, ROLL_DOWN);
    const result = useUpHeroStore.getState().enhanceItem("it-1");
    expect(result).toMatchObject({ ok: false, reason: "down", prevLevel: RISK_LEVEL });
    const item = useUpHeroStore.getState().inventory[0];
    expect(item.enhanceLevel).toBe(RISK_LEVEL - 1);
    expect(item.name).toBe("쇠검 +5");
  });

  it("유지 구간에서는 아무것도 바뀌지 않는다", () => {
    seedStore({});
    queueRolls(ROLL_FAIL, ROLL_KEEP);
    expect(useUpHeroStore.getState().enhanceItem("it-1")).toMatchObject({
      ok: false,
      reason: "keep",
    });
    expect(useUpHeroStore.getState().inventory[0].enhanceLevel).toBe(RISK_LEVEL);
  });

  it("안전 구간(+0→+3)에서는 실패해도 언제나 유지다", () => {
    // 3분기 롤이 0 이어도 소실·하락 확률이 0 이라 적중할 수 없다.
    for (const level of [0, 1, 2]) {
      seedStore({ destroy: 2, down: 2 }, makeItem({ enhanceLevel: level, name: "쇠검" }));
      queueRolls(ROLL_FAIL, 0);
      expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toMatchObject({
        ok: false,
        reason: "keep",
      });
      const s = useUpHeroStore.getState();
      expect(s.inventory[0].enhanceLevel).toBe(level);
      // 안전 구간에서는 방지권도 소모되지 않는다 — 그 결과가 날 수 없으니 arm 되지 않는다.
      expect(s.destroyGuards).toBe(2);
      expect(s.downGuards).toBe(2);
    }
  });
});

describe("enhanceItem — 방지권 소모 매트릭스 (소모 == armed)", () => {
  beforeEach(() => seedStore({ destroy: 2, down: 2 }));
  afterEach(() => vi.restoreAllMocks());

  const SPENT_BOTH = { destroy: 1, down: 1 };
  const SPENT_NONE = { destroy: 0, down: 0 };

  it("둘 다 걸고 성공 → 둘 다 1장씩 나간다, spent {1,1}", () => {
    queueRolls(0.0001); // 성공 판정 적중 → 3분기 판정 자체가 없다
    const r = useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(r).toMatchObject({ ok: true, reason: "success", spent: SPENT_BOTH });
    expect(useUpHeroStore.getState().destroyGuards).toBe(1);
    expect(useUpHeroStore.getState().downGuards).toBe(1);
  });

  it("둘 다 걸고 유지로 끝난 실패 → 그래도 둘 다 나간다, spent {1,1}", () => {
    queueRolls(ROLL_FAIL, ROLL_KEEP);
    const r = useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(r).toMatchObject({ ok: false, reason: "keep", spent: SPENT_BOTH });
    expect(useUpHeroStore.getState().destroyGuards).toBe(1);
    expect(useUpHeroStore.getState().downGuards).toBe(1);
  });

  it("둘 다 걸고 소실이 굴러나오면 막힌다 (guarded destroy), 둘 다 나간다", () => {
    queueRolls(ROLL_FAIL, ROLL_DESTROY);
    const r = useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(r).toMatchObject({
      ok: false,
      reason: "guarded",
      guard: "destroy",
      spent: SPENT_BOTH,
    });
    const s = useUpHeroStore.getState();
    expect(s.destroyGuards).toBe(1);
    // 하락은 나지 않았지만 걸어뒀으므로 하락방지권도 시도의 값으로 나갔다.
    expect(s.downGuards).toBe(1);
    expect(s.inventory).toHaveLength(1);
    expect(s.inventory[0].enhanceLevel).toBe(RISK_LEVEL);
  });

  it("둘 다 걸고 하락이 굴러나오면 막힌다 (guarded down), 둘 다 나간다", () => {
    queueRolls(ROLL_FAIL, ROLL_DOWN);
    const r = useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(r).toMatchObject({
      ok: false,
      reason: "guarded",
      guard: "down",
      spent: SPENT_BOTH,
    });
    const s = useUpHeroStore.getState();
    expect(s.downGuards).toBe(1);
    expect(s.destroyGuards).toBe(1);
    expect(s.inventory[0].enhanceLevel).toBe(RISK_LEVEL);
  });

  it("하락방지권만 걸고 소실이 나면 소실된다 — 걸어둔 하락방지권은 그래도 나간다, spent {0,1}", () => {
    queueRolls(ROLL_FAIL, ROLL_DESTROY);
    const r = useUpHeroStore
      .getState()
      .enhanceItem("it-1", { destroy: false, down: true });
    expect(r).toMatchObject({
      ok: false,
      reason: "destroyed",
      spent: { destroy: 0, down: 1 },
    });
    const s = useUpHeroStore.getState();
    expect(s.destroyGuards).toBe(2);
    expect(s.downGuards).toBe(1);
    expect(s.inventory).toHaveLength(0);
  });

  it("소실방지권만 걸고 하락이 나면 내려간다 — 소실방지권은 나가고 하락방지권은 그대로, spent {1,0}", () => {
    queueRolls(ROLL_FAIL, ROLL_DOWN);
    const r = useUpHeroStore
      .getState()
      .enhanceItem("it-1", { destroy: true, down: false });
    expect(r).toMatchObject({
      ok: false,
      reason: "down",
      prevLevel: RISK_LEVEL,
      spent: { destroy: 1, down: 0 },
    });
    const s = useUpHeroStore.getState();
    expect(s.destroyGuards).toBe(1);
    expect(s.downGuards).toBe(2);
    expect(s.inventory[0].enhanceLevel).toBe(RISK_LEVEL - 1);
  });

  it("rare +12 (소실 0 / 하락 100%) 는 둘 다 걸어도 소실방지권은 나가지 않는다", () => {
    // 중간 밴드: 결과는 성공 또는 막힌 하락뿐이다. 소실은 불가능하므로 arm 되지 않는다.
    seedStore({ destroy: 2, down: 2 }, makeItem({ enhanceLevel: 12, name: "쇠검 +12" }));
    expect(enhanceOutcomeRates("rare", 12)).toEqual({ destroy: 0, down: 1, keep: 0 });
    queueRolls(ROLL_FAIL, 0);
    const failed = useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(failed).toMatchObject({
      ok: false,
      reason: "guarded",
      guard: "down",
      spent: { destroy: 0, down: 1 },
    });
    expect(useUpHeroStore.getState().destroyGuards).toBe(2);
    expect(useUpHeroStore.getState().downGuards).toBe(1);
    expect(useUpHeroStore.getState().inventory[0].enhanceLevel).toBe(12);
    vi.restoreAllMocks();

    queueRolls(0.0001);
    const ok = useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(ok).toMatchObject({ ok: true, reason: "success", spent: { destroy: 0, down: 1 } });
    expect(useUpHeroStore.getState().destroyGuards).toBe(2);
    expect(useUpHeroStore.getState().downGuards).toBe(0);
    expect(useUpHeroStore.getState().inventory[0].enhanceLevel).toBe(13);
  });

  it("보유 0 이면 걸어도 무시된다 — 소실이 그대로 나고 개수는 음수로 내려가지 않는다", () => {
    seedStore({ destroy: 0, down: 0 });
    queueRolls(ROLL_FAIL, ROLL_DESTROY);
    expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toMatchObject({
      reason: "destroyed",
      spent: SPENT_NONE,
    });
    expect(useUpHeroStore.getState().destroyGuards).toBe(0);
    expect(useUpHeroStore.getState().downGuards).toBe(0);

    seedStore({ destroy: 0, down: 0 });
    queueRolls(ROLL_FAIL, ROLL_DOWN);
    expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toMatchObject({
      reason: "down",
      spent: SPENT_NONE,
    });
    expect(useUpHeroStore.getState().downGuards).toBe(0);
  });

  it("저장본에 필드가 없어도(undefined) 소실 경로가 예전과 똑같이 동작한다", () => {
    // 기존 유저 마이그레이션 — 필드 부재는 "미보유" 로만 읽혀야 하고,
    // 그 때문에 강화 자체가 깨지면 안 된다.
    useUpHeroStore.setState({ destroyGuards: undefined, downGuards: undefined });
    queueRolls(ROLL_FAIL, ROLL_DESTROY);
    expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toMatchObject({
      reason: "destroyed",
      spent: SPENT_NONE,
    });
    expect(useUpHeroStore.getState().destroyGuards ?? 0).toBe(0);
  });

  it("코인이 모자라 시도 자체가 무산되면 아무것도 소모하지 않는다", () => {
    useUpHeroStore.setState({ coins: 0 });
    expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toMatchObject({
      reason: "coin",
    });
    expect(useUpHeroStore.getState().destroyGuards).toBe(2);
    expect(useUpHeroStore.getState().downGuards).toBe(2);
  });

  it("안전 구간(0..2)에서는 걸어도 아무것도 나가지 않는다, spent {0,0}", () => {
    seedStore({ destroy: 2, down: 2 }, makeItem({ enhanceLevel: 1, name: "쇠검 +1" }));
    queueRolls(ROLL_FAIL, 0);
    expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toMatchObject({
      reason: "keep",
      spent: SPENT_NONE,
    });
    expect(useUpHeroStore.getState().destroyGuards).toBe(2);
    expect(useUpHeroStore.getState().downGuards).toBe(2);
  });

  it("걸지 않으면 나가지 않는다 — 기본값은 둘 다 OFF", () => {
    queueRolls(ROLL_FAIL, ROLL_KEEP);
    expect(useUpHeroStore.getState().enhanceItem("it-1")).toMatchObject({
      reason: "keep",
      spent: SPENT_NONE,
    });
    expect(useUpHeroStore.getState().destroyGuards).toBe(2);
    expect(useUpHeroStore.getState().downGuards).toBe(2);
  });

  it("막아준 실패에서도 시도 비용은 그대로 나간다", () => {
    const before = useUpHeroStore.getState().coins;
    queueRolls(ROLL_FAIL, ROLL_DESTROY);
    useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH);
    expect(useUpHeroStore.getState().coins).toBe(
      before - enhanceCost("rare", RISK_LEVEL),
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Phase 5-B — 상위 밴드 성장 (+11..+20) + 사진 부적 상한
 * ══════════════════════════════════════════════════════════════════════ */

describe("enhanceItem — 상위 밴드 성장과 마일스톤", () => {
  afterEach(() => vi.restoreAllMocks());

  it("+10 → +11: primary +1 (매 레벨)", () => {
    seedStore({}, makeItem({ enhanceLevel: 10, name: "쇠검 +10", stats: { str: 10, dex: 3 } }));
    queueRolls(0.0000001);
    const r = useUpHeroStore.getState().enhanceItem("it-1");
    expect(r).toMatchObject({ ok: true, prevLevel: 10 });
    const item = useUpHeroStore.getState().inventory[0];
    expect(item.enhanceLevel).toBe(11);
    expect(item.name).toBe("쇠검 +11");
    expect(item.stats).toEqual({ str: 11, dex: 3 });
  });

  it("+14 → +15: primary +1 & secondary +2, 이름 '쇠검 +15'; 하락 15 → 14 는 정확한 역", () => {
    const original = { str: 20, dex: 4 };
    seedStore({}, makeItem({ enhanceLevel: 14, name: "쇠검 +14", stats: { ...original } }));
    queueRolls(0.0000001);
    expect(useUpHeroStore.getState().enhanceItem("it-1").ok).toBe(true);
    let item = useUpHeroStore.getState().inventory[0];
    expect(item.enhanceLevel).toBe(15);
    expect(item.name).toBe("쇠검 +15");
    expect(item.stats).toEqual({ str: 21, dex: 6 });
    vi.restoreAllMocks();

    const rates = enhanceOutcomeRates("rare", 15);
    expect(rates.down).toBeGreaterThan(0);
    queueRolls(ROLL_FAIL, rates.destroy + rates.down / 2);
    const down = useUpHeroStore.getState().enhanceItem("it-1");
    expect(down).toMatchObject({ reason: "down", prevLevel: 15 });
    item = useUpHeroStore.getState().inventory[0];
    expect(item.enhanceLevel).toBe(14);
    expect(item.name).toBe("쇠검 +14");
    expect(item.stats).toEqual(original);
  });

  it("+19 → +20: primary +1 & secondary +3, 그 뒤는 maxed", () => {
    seedStore({}, makeItem({ enhanceLevel: 19, name: "쇠검 +19", stats: { str: 30, dex: 5 } }));
    queueRolls(0.0000001);
    expect(useUpHeroStore.getState().enhanceItem("it-1").ok).toBe(true);
    const item = useUpHeroStore.getState().inventory[0];
    expect(item.enhanceLevel).toBe(20);
    expect(item.name).toBe("쇠검 +20");
    expect(item.stats).toEqual({ str: 31, dex: 8 });
    vi.restoreAllMocks();

    const coins = useUpHeroStore.getState().coins;
    queueRolls(0.0000001);
    expect(useUpHeroStore.getState().enhanceItem("it-1", ARM_BOTH)).toEqual({
      ok: false,
      reason: "maxed",
    });
    expect(useUpHeroStore.getState().coins).toBe(coins);
  });
});

describe("enhanceItem — 사진 부적 (photoId) 은 상한 10 + 스킬 재계산", () => {
  afterEach(() => vi.restoreAllMocks());

  const photoItem = (level: number): Equipment =>
    ({
      id: "ph-1",
      name: `추억의 부적 +${level}`,
      type: "talisman",
      rarity: "rare",
      category: "fitness",
      iconName: "Photo",
      photoId: "photo-1",
      stats: { vit: 3 },
      enhanceLevel: level,
    }) as Equipment;

  it("+4 → +5 에 도달하면 talismanSkills 1개가 붙는다", () => {
    seedStore({}, photoItem(4));
    queueRolls(0.0000001);
    const r = useUpHeroStore.getState().enhanceItem("ph-1");
    expect(r).toMatchObject({ ok: true, prevLevel: 4 });
    const item = useUpHeroStore.getState().inventory[0];
    expect(item.enhanceLevel).toBe(5);
    expect(item.talismanSkills).toHaveLength(1);
  });

  it("+10 이면 일반 장비와 달리 maxed 다", () => {
    seedStore({}, photoItem(10));
    queueRolls(0.0000001);
    expect(useUpHeroStore.getState().enhanceItem("ph-1")).toEqual({
      ok: false,
      reason: "maxed",
    });
    expect(useUpHeroStore.getState().inventory[0].enhanceLevel).toBe(10);
  });
});

describe("enhanceItem — 하락 stats 왕복 정합성", () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * 성공은 "새 레벨이 짝수일 때 primary stat +1" 이다. 하락은 그 정확한 역이어야
   * 하며, 아니면 성공/하락을 반복하는 것만으로 스탯이 무한히 오르거나 깎이는
   * 구멍이 생긴다. 그래서 왕복(성공 → 하락)이 원본과 바이트로 같은지 본다.
   */
  it("성공 직후 하락하면 stats 가 원래대로 돌아온다", () => {
    for (const startLevel of [3, 4, 5, 6, 7]) {
      const original = makeItem({ enhanceLevel: startLevel, name: "쇠검", stats: { str: 5, dex: 3 } });
      seedStore({}, original);
      queueRolls(0.0000001); // 성공
      const up = useUpHeroStore.getState().enhanceItem("it-1");
      expect(up.ok).toBe(true);
      vi.restoreAllMocks();

      // 하락 롤은 "지금 레벨" 기준이어야 한다 — 성공으로 한 칸 올라갔으므로
      // 확률 구간도 그 레벨의 것을 써야 down 에 떨어진다.
      const upRates = enhanceOutcomeRates("rare", startLevel + 1);
      queueRolls(ROLL_FAIL, upRates.destroy + upRates.down / 2);
      const down = useUpHeroStore.getState().enhanceItem("it-1");
      expect(down).toMatchObject({ reason: "down" });
      const after = useUpHeroStore.getState().inventory[0];
      expect(after.enhanceLevel).toBe(startLevel);
      expect(after.stats).toEqual(original.stats);
      vi.restoreAllMocks();
    }
  });

  it("stats 는 음수로 내려가지 않는다", () => {
    // 손상된 저장본 방어 — primary 가 0 인 아이템이 하락해도 음수가 되지 않는다.
    seedStore({}, makeItem({ enhanceLevel: 6, stats: { str: 0 } }));
    queueRolls(ROLL_FAIL, ROLL_DOWN);
    useUpHeroStore.getState().enhanceItem("it-1");
    expect(useUpHeroStore.getState().inventory[0].stats.str).toBe(0);
  });
});

describe("purchaseDownGuard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("코인을 차감하고 1장을 준다", () => {
    seedStore({});
    useUpHeroStore.setState({ coins: 1000 });
    expect(useUpHeroStore.getState().purchaseDownGuard()).toBe(true);
    expect(useUpHeroStore.getState().downGuards).toBe(1);
    expect(useUpHeroStore.getState().coins).toBe(1000 - SHOP_PRICES.downGuard);
    // 상점은 하락방지권만 판다 — 소실방지권은 여기서 늘어나면 안 된다.
    expect(useUpHeroStore.getState().destroyGuards).toBe(0);
  });

  it("코인이 모자라면 상태를 건드리지 않는다", () => {
    seedStore({ down: 3 });
    useUpHeroStore.setState({ coins: 10 });
    expect(useUpHeroStore.getState().purchaseDownGuard()).toBe(false);
    expect(useUpHeroStore.getState().downGuards).toBe(3);
    expect(useUpHeroStore.getState().coins).toBe(10);
  });

  it("보유 상한에서는 결제되지 않는다 — 코인만 빠지는 구매는 없다", () => {
    seedStore({ down: ENHANCE_GUARD_MAX });
    useUpHeroStore.setState({ coins: 100000 });
    expect(useUpHeroStore.getState().purchaseDownGuard()).toBe(false);
    expect(useUpHeroStore.getState().coins).toBe(100000);
    expect(useUpHeroStore.getState().downGuards).toBe(ENHANCE_GUARD_MAX);
  });
});

describe("grantEnhanceGuards — 드롭 경로", () => {
  afterEach(() => vi.restoreAllMocks());

  it("보스/이벤트 지급이 누적된다", () => {
    seedStore({ destroy: 1 });
    expect(useUpHeroStore.getState().grantEnhanceGuards({ destroy: 2 })).toEqual({
      destroy: 2,
      down: 0,
    });
    expect(useUpHeroStore.getState().destroyGuards).toBe(3);
  });

  it("상한을 넘는 만큼은 조용히 잘린다", () => {
    seedStore({ destroy: ENHANCE_GUARD_MAX - 1 });
    expect(useUpHeroStore.getState().grantEnhanceGuards({ destroy: 5 }).destroy).toBe(1);
    expect(useUpHeroStore.getState().destroyGuards).toBe(ENHANCE_GUARD_MAX);
  });

  it("음수·소수는 무시한다", () => {
    seedStore({ destroy: 1, down: 1 });
    useUpHeroStore.getState().grantEnhanceGuards({ destroy: -5, down: 0.4 });
    expect(useUpHeroStore.getState().destroyGuards).toBe(1);
    expect(useUpHeroStore.getState().downGuards).toBe(1);
  });
});

describe("grantCombatBuff — 슬롯 보상", () => {
  afterEach(() => vi.restoreAllMocks());

  // pct 는 퍼센트 포인트다 (10 = +10%) — 세션 층위와 같은 단위. 굴림틀이 주는
  // 실제 값 10 을 그대로 쓴다. 예전엔 상한이 1 이라 10 이 1 로 접혔고, 그 상태로
  // 다음 탐험에 실리면 `1 + pct/100` 이 +1% 가 됐다.
  it("버프를 심고, 더 약한 버프로는 덮이지 않는다", () => {
    seedStore({});
    useUpHeroStore.getState().grantCombatBuff(10, 3);
    expect(useUpHeroStore.getState().combatBuff).toEqual({ pct: 10, battlesLeft: 3 });
    useUpHeroStore.getState().grantCombatBuff(5, 10);
    expect(useUpHeroStore.getState().combatBuff).toEqual({ pct: 10, battlesLeft: 3 });
    useUpHeroStore.getState().grantCombatBuff(20, 3);
    expect(useUpHeroStore.getState().combatBuff).toEqual({ pct: 20, battlesLeft: 3 });
  });

  it("0 이하 값은 버프를 만들지 않는다", () => {
    seedStore({});
    useUpHeroStore.getState().grantCombatBuff(0, 3);
    useUpHeroStore.getState().grantCombatBuff(10, 0);
    expect(useUpHeroStore.getState().combatBuff).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Phase 16 (Track C) — 던전 코어: 재진입 시작층 + 주간 악몽 보상 지급
 * ══════════════════════════════════════════════════════════════════════ */

// 주간 점수 업로드는 Firestore 로 나간다 — 정산 테스트에선 통째로 대체.
vi.mock("@/lib/weeklyLeaderboard", () => ({
  uploadWeeklyScore: vi.fn(async () => "skipped"),
  getDisplayName: vi.fn(async (fallback: string) => fallback),
}));

import { createMonsterForFloor } from "@/data/upHeroMonsters";
import { createSession } from "@/lib/upHeroCombat";
import {
  WEEKLY_ALL_CLEAR_COINS,
  WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
  WEEKLY_ALL_CLEAR_DOWN_GUARDS,
  WEEKLY_FIRST_CLEAR_COINS,
  WEEKLY_FIRST_CLEAR_DESTROY_GUARDS,
} from "@/lib/sessionReward";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import type { CombatSession, DungeonId } from "@/types/uphero";

describe("enterDungeon — 미처치 보스층에서 시작 (피드백 19/26)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("floorReached 21, bossesDefeated [10] → F20 시작 + 보스 스폰 + paused", () => {
    seedStore({});
    useUpHeroStore.setState({
      passes: { fitness: 1 },
      dungeons: {
        fitness: {
          dungeonId: "fitness",
          floorReached: 21,
          bestFloorReached: 21,
          bossesDefeated: [10],
        },
      },
      currentSession: null,
    });
    expect(useUpHeroStore.getState().enterDungeon("fitness")).toBe(true);
    const session = useUpHeroStore.getState().currentSession;
    expect(session?.startFloor).toBe(20);
    expect(session?.currentFloor).toBe(20);
    expect(session?.status).toBe("paused");
    const last = session?.log[session.log.length - 1];
    expect(last).toMatchObject({ type: "boss", floor: 20 });
  });

  it("보스를 다 잡았으면 floorReached + 1 에서 시작 (기존 동작)", () => {
    seedStore({});
    useUpHeroStore.setState({
      passes: { fitness: 1 },
      dungeons: {
        fitness: {
          dungeonId: "fitness",
          floorReached: 21,
          bestFloorReached: 21,
          bossesDefeated: [10, 20],
        },
      },
      currentSession: null,
    });
    expect(useUpHeroStore.getState().enterDungeon("fitness")).toBe(true);
    const session = useUpHeroStore.getState().currentSession;
    expect(session?.startFloor).toBe(22);
    expect(session?.status).toBe("active");
  });
});

describe("acknowledgeSessionEnd — 주간 악몽 보상 (피드백 30)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** F30 보스를 처치하고 끝난 주간 세션. 코인 보상은 0 으로 두어 주간분만 센다. */
  function weeklyClearSession(dungeonId: DungeonId): CombatSession {
    const s = createSession(dungeonId, createDefaultHero(), 30, undefined, {
      isWeeklyVariant: true,
      heroLevel: 30,
    });
    const boss = createMonsterForFloor(dungeonId, 30, true);
    s.log.push({ type: "encounter", monster: boss, timestamp: Date.now() });
    s.log.push({ type: "victory", monster: boss, xp: 0, coins: 0, timestamp: Date.now() });
    s.log.push({ type: "sessionEnd", reason: "bossDefeated", timestamp: Date.now() });
    s.status = "completed";
    s.rewards = { xp: 0, coins: 0, drops: [] };
    return s;
  }

  function seedWeekly(cleared: DungeonId[], guards = 0) {
    seedStore({ destroy: guards, down: guards });
    useUpHeroStore.setState({
      coins: 1000,
      dungeons: {},
      weeklyVariant: {
        week: "2026-W36",
        affixId: "glass_cannon",
        clearedDungeons: cleared,
        // 점수 업로드 분기 (isNewBest) 를 피하려 최고점을 높게 둔다.
        bestScore: 1_000_000,
      },
      currentSession: weeklyClearSession("fitness"),
    });
  }

  it("첫 클리어 → 코인 +600, 소실방지권 +1, clearedDungeons 에 추가", () => {
    seedWeekly([]);
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    expect(st.coins).toBe(1000 + WEEKLY_FIRST_CLEAR_COINS);
    expect(st.destroyGuards).toBe(WEEKLY_FIRST_CLEAR_DESTROY_GUARDS);
    expect(st.downGuards).toBe(0);
    expect(st.weeklyVariant?.clearedDungeons).toContain("fitness");
    expect(st.currentSession).toBeNull();
  });

  it("같은 주 같은 던전 두 번째 정산은 보상 없음", () => {
    seedWeekly([]);
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const after1 = useUpHeroStore.getState();
    useUpHeroStore.setState({ currentSession: weeklyClearSession("fitness") });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const after2 = useUpHeroStore.getState();
    expect(after2.coins).toBe(after1.coins);
    expect(after2.destroyGuards).toBe(after1.destroyGuards);
    expect(after2.weeklyVariant?.clearedDungeons).toHaveLength(1);
  });

  it("7 → 8 전환이면 올클리어 보너스까지", () => {
    const others = DUNGEON_LIST.map((d) => d.id).filter((id) => id !== "fitness");
    seedWeekly(others);
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    expect(st.coins).toBe(1000 + WEEKLY_FIRST_CLEAR_COINS + WEEKLY_ALL_CLEAR_COINS);
    expect(st.destroyGuards).toBe(
      WEEKLY_FIRST_CLEAR_DESTROY_GUARDS + WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
    );
    expect(st.downGuards).toBe(WEEKLY_ALL_CLEAR_DOWN_GUARDS);
    expect(st.weeklyVariant?.clearedDungeons).toHaveLength(8);
  });

  it("방지권은 상한 (ENHANCE_GUARD_MAX) 에서 잘린다", () => {
    seedWeekly([], ENHANCE_GUARD_MAX);
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().destroyGuards).toBe(ENHANCE_GUARD_MAX);
  });

  it("일반 (비주간) 세션은 주간 보상이 없다", () => {
    seedWeekly([]);
    const s = weeklyClearSession("fitness");
    s.isWeeklyVariant = undefined;
    useUpHeroStore.setState({ currentSession: s });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().coins).toBe(1000);
    expect(useUpHeroStore.getState().destroyGuards).toBe(0);
  });
});
