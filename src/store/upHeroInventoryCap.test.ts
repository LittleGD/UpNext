import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 6-E (Track E, 피드백 22) — 정산 가방 반영 / 넘친 전리품(레거시) / 합성 / 모달 게이트.
 *
 * 격자 가방 도입 뒤 정산은 `settleBagAfterSession` 이 맡는다: 드롭은 first-fit 으로
 * 보드에 들어가고, 정리 대기 트레이가 10 을 넘기면 **이번 드롭만** 자동 판매된다.
 * `overflowDrops` 는 더 이상 생산되지 않고 (프로덕션 저장본에 남은 것만) 캠프의
 * BagOverflowModal 이 비운다. 합성은 같은 등급 3개를 다음 등급 1개로 바꾸고 도감에 즉시 적는다.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore, pickPersisted } from "./useUpHeroStore";
import { createSession } from "@/lib/upHeroCombat";
import { setRngSeed, resetRng } from "@/lib/upHeroRng";
import { isBagOverflowVisible } from "@/lib/bagOverflowGate";
import { getEquipmentBaseName } from "@/data/upHeroEquipment";
import { useGrowthStore } from "./useGrowthStore";
import type { PhotoMeta } from "@/types/growth";
import {
  createDefaultHero,
  sellPrice,
  type CombatSession,
  type Equipment,
} from "@/types/uphero";

function item(n: number, overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: `inv-${n}`,
    baseId: "self_control_sword",
    name: "자기절제의 검",
    type: "weapon",
    rarity: "normal",
    category: "fitness",
    iconName: "Sword",
    stats: { str: 5 },
    dropFloor: 3,
    ...overrides,
  };
}

/** 완료된 세션 (시간 만료) — 드롭 N개. */
function completedSession(drops: Equipment[]): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.status = "completed";
  s.rewards = { ...s.rewards, drops };
  s.log.push({ type: "sessionEnd", reason: "timeExpired", timestamp: Date.now() });
  return s;
}

beforeEach(() => {
  useUpHeroStore.getState().resetForSignOut();
  useUpHeroStore.setState({ isLoaded: true });
});
afterEach(() => resetRng());

describe("정산 — 격자 가방 반영 (settleBagAfterSession)", () => {
  /** 4행 보드(확장 0)의 십자를 뺀 빈 칸 15개 — 1x1 장신구로 전부 채운다. */
  const FREE_CELLS: Array<[number, number]> = [
    [0, 0], [1, 0], [3, 0], [4, 0],
    [0, 1], [4, 1],
    [0, 2], [1, 2], [3, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [3, 3], [4, 3],
  ];
  const filledBoard = () =>
    FREE_CELLS.map(([x, y], i) =>
      item(i, { type: "accessory", bagX: x, bagY: y, bagRot: 0 }),
    );

  it("빈 칸이 있으면 드롭은 first-fit 으로 보드에 들어간다 (overflowDrops 불변)", () => {
    const drops = Array.from({ length: 3 }, (_, i) => item(100 + i, { dropFloor: 7 }));
    useUpHeroStore.setState({
      inventory: [item(1)],
      overflowDrops: [item(50)],
      currentSession: completedSession(drops),
      coins: 0,
    });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    expect(st.inventory.map((i) => i.id)).toEqual(["inv-1", "inv-100", "inv-101", "inv-102"]);
    expect(st.inventory.slice(1).every((i) => i.bagX != null && i.bagY != null)).toBe(true);
    // 레거시 필드는 정산이 더 이상 늘리지 않는다 — 남아 있던 것만 그대로.
    expect(st.overflowDrops.map((i) => i.id)).toEqual(["inv-50"]);
    expect(st.coins).toBe(0);
    expect(st.currentSession).toBeNull();
  });

  it("보드가 가득 차고 트레이 10 을 넘기면 이번 드롭만 sellPrice 로 자동 판매된다", () => {
    // 기존 트레이 10개는 캡을 넘어도 절대 팔리지 않는다 (격자 도입 전 저장본 보호).
    const tray = Array.from({ length: 10 }, (_, i) => item(200 + i, { rarity: "rare" }));
    const drops = [
      item(300, { rarity: "rare", dropFloor: 12, enhanceLevel: 3 }),
      item(301, { rarity: "normal", dropFloor: 30 }),
      item(302, { rarity: "unique", dropFloor: 20 }),
    ];
    useUpHeroStore.setState({
      inventory: [...filledBoard(), ...tray],
      overflowDrops: [],
      currentSession: completedSession(drops),
      coins: 0,
    });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    const ids = new Set(st.inventory.map((i) => i.id));
    for (const t of tray) expect(ids.has(t.id)).toBe(true);
    for (const d of drops) expect(ids.has(d.id)).toBe(false);
    expect(st.inventory.length).toBe(25);
    expect(st.overflowDrops).toEqual([]);
    expect(st.coins).toBe(
      sellPrice("rare", 12, 3) + sellPrice("normal", 30, undefined) + sellPrice("unique", 20, undefined),
    );
  });

  it("정산은 도감에 rewards.drops 도 합친다", () => {
    useUpHeroStore.setState({
      inventory: [],
      currentSession: completedSession([
        item(1, { baseId: "grain_armor", name: "곡물의 갑옷", type: "armor" }),
      ]),
    });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().codex.equipment).toContain("곡물의 갑옷");
  });
});

describe("overflow 처리", () => {
  it("resolveOverflowItem(sell) 은 sellPrice 만큼 코인을 주고 목록에서 뺀다", () => {
    const a = item(1, { rarity: "rare", dropFloor: 12, enhanceLevel: 3 });
    const b = item(2);
    useUpHeroStore.setState({ overflowDrops: [a, b], coins: 10 });
    const refund = useUpHeroStore.getState().resolveOverflowItem("inv-1", "sell");
    expect(refund).toBe(sellPrice("rare", 12, 3));
    expect(refund).toBe(57);
    expect(useUpHeroStore.getState().coins).toBe(67);
    expect(useUpHeroStore.getState().overflowDrops.map((i) => i.id)).toEqual(["inv-2"]);
  });

  it("discard 는 0, 없는 id 도 0", () => {
    useUpHeroStore.setState({ overflowDrops: [item(1)], coins: 10 });
    expect(useUpHeroStore.getState().resolveOverflowItem("inv-1", "discard")).toBe(0);
    expect(useUpHeroStore.getState().coins).toBe(10);
    expect(useUpHeroStore.getState().overflowDrops).toEqual([]);
    expect(useUpHeroStore.getState().resolveOverflowItem("nope", "sell")).toBe(0);
  });

  it("sellAllOverflow 는 합계를 돌려주고 비운다", () => {
    const list = [
      item(1, { rarity: "legend", dropFloor: 30, enhanceLevel: 10 }),
      item(2, { rarity: "normal", dropFloor: 30 }),
    ];
    useUpHeroStore.setState({ overflowDrops: list, coins: 0 });
    expect(useUpHeroStore.getState().sellAllOverflow()).toBe(840 + 35);
    expect(useUpHeroStore.getState().coins).toBe(875);
    expect(useUpHeroStore.getState().overflowDrops).toEqual([]);
    expect(useUpHeroStore.getState().sellAllOverflow()).toBe(0);
  });

  it("pickPersisted 에 overflowDrops 가 포함된다", () => {
    useUpHeroStore.setState({ overflowDrops: [item(9)] });
    const persisted = pickPersisted(useUpHeroStore.getState());
    expect(persisted.overflowDrops?.map((i) => i.id)).toEqual(["inv-9"]);
  });
});

describe("판매가 (sellItem)", () => {
  it("등급 + 층 + 강화 가산", () => {
    useUpHeroStore.setState({
      inventory: [item(1, { rarity: "legend", dropFloor: 30, enhanceLevel: 10 })],
      coins: 0,
    });
    expect(useUpHeroStore.getState().sellItem("inv-1")).toBe(840);
    expect(useUpHeroStore.getState().coins).toBe(840);
  });
});

describe("synthesizeItems", () => {
  const rares = () => [
    item(1, { rarity: "rare", dropFloor: 12 }),
    item(2, { rarity: "rare", dropFloor: 20, category: "learning" }),
    item(3, { rarity: "rare", dropFloor: 15 }),
  ];

  it("rare 3개 → 인벤 -2, unique 1개, 도감 기록", () => {
    setRngSeed(11);
    useUpHeroStore.setState({ inventory: [...rares(), item(4)] });
    const r = useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-2", "inv-3"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const st = useUpHeroStore.getState();
    expect(st.inventory.length).toBe(2);
    expect(st.inventory.map((i) => i.id)).toContain("inv-4");
    expect(r.item.rarity).toBe("unique");
    expect(r.item.dropFloor).toBe(20);
    expect(st.inventory[st.inventory.length - 1].id).toBe(r.item.id);
    expect(st.codex.equipment).toEqual([getEquipmentBaseName(r.item)]);
  });

  it("장착 중(인벤에 없음) id → not-found, 재료 개수 ≠ 3 → count", () => {
    useUpHeroStore.setState({ inventory: rares() });
    expect(useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-2", "equipped-x"])).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-2"])).toEqual({
      ok: false,
      reason: "count",
    });
    expect(useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-1", "inv-2"])).toEqual({
      ok: false,
      reason: "count",
    });
    expect(useUpHeroStore.getState().inventory.length).toBe(3);
  });

  it("등급 불일치 / legend / 사진 부적", () => {
    const mixed = rares();
    mixed[2] = item(3, { rarity: "unique" });
    useUpHeroStore.setState({ inventory: mixed });
    expect(useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-2", "inv-3"])).toEqual({
      ok: false,
      reason: "rarity",
    });
    useUpHeroStore.setState({ inventory: rares().map((i) => ({ ...i, rarity: "legend" as const })) });
    expect(useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-2", "inv-3"])).toEqual({
      ok: false,
      reason: "legend",
    });
    const photo = rares();
    photo[0] = item(1, { rarity: "rare", type: "talisman", photoId: "p" });
    useUpHeroStore.setState({ inventory: photo });
    expect(useUpHeroStore.getState().synthesizeItems(["inv-1", "inv-2", "inv-3"])).toEqual({
      ok: false,
      reason: "photo",
    });
  });
});

describe("BagOverflowModal 게이트", () => {
  const base = {
    overflowDrops: [item(1)],
    currentSession: null,
    pendingHeroLevelUp: null,
    pendingClassChoice: null,
  };
  it("overflow 가 있고 세션·레벨업·전직이 없을 때만 true", () => {
    expect(isBagOverflowVisible(base)).toBe(true);
    expect(isBagOverflowVisible({ ...base, overflowDrops: [] })).toBe(false);
    expect(isBagOverflowVisible({ ...base, pendingHeroLevelUp: { from: 3, to: 4 } })).toBe(false);
    expect(isBagOverflowVisible({ ...base, pendingClassChoice: { recommended: "warrior" } })).toBe(
      false,
    );
    expect(
      isBagOverflowVisible({ ...base, currentSession: completedSession([]) }),
    ).toBe(false);
  });

  it("스토어 셀렉터로도 같은 결과 — pendingHeroLevelUp 이 서 있으면 false", () => {
    useUpHeroStore.setState({ overflowDrops: [item(1)], pendingHeroLevelUp: { from: 1, to: 2 } });
    expect(isBagOverflowVisible(useUpHeroStore.getState())).toBe(false);
    useUpHeroStore.setState({ pendingHeroLevelUp: null });
    expect(isBagOverflowVisible(useUpHeroStore.getState())).toBe(true);
  });
});

describe("사진 부적 의식 — 가방 가득", () => {
  it("보드가 가득 차도 거절하지 않는다 — 새 부적은 트레이로 들어간다 (격자 계약)", () => {
    useUpHeroStore.setState({
      inventory: Array.from({ length: 30 }, (_, i) => item(i)),
      coins: 9999,
    });
    // photoMetas 가 비어 있으면 photoNotFound 가 먼저 — 사진을 시드한다.
    useGrowthStore.setState({
      photoMetas: [
        {
          id: "ph-1",
          challengeTitle: "달리기",
          category: "fitness",
          date: "2026-09-05",
        } as unknown as PhotoMeta,
      ],
    });
    const r = useUpHeroStore.getState().bindPhotoAsTalisman("ph-1");
    expect(r.ok).toBe(true);
    expect(useUpHeroStore.getState().inventory.length).toBe(31);
  });
});
