import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * 격자 가방 — **스토어 왕복 계약.**
 *
 * 순수 규칙(모양·first-fit·시너지 표)은 `upHeroBag.test.ts` 가 본다. 여기서는
 * 스토어를 실제로 굴려서 "상태에 남는 모양" 을 붙잡는다:
 *   - 배치 실패는 상태를 전혀 건드리지 않는다 (persist 도 하지 않는다)
 *   - 착용은 좌표를 벗기고, 교체는 벗겨지는 아이템이 그 자리를 **같은 index** 로 물려받는다
 *   - 해제·정산은 절대 실패하지 않는다 (자리가 없으면 정리 대기 트레이)
 *   - 미배치 전환은 키 **삭제**다. `bagX: undefined` 가 남으면 Firestore 업로드가 throw 한다
 *
 * 마지막 항목이 이 파일의 존재 이유다 — 타입만으로는 잡히지 않고, 클라우드로
 * 나가는 순간에야 터진다.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { saveToStorage } from "@/lib/storage";
import { useUpHeroStore, currentBagRows } from "./useUpHeroStore";
import { useGameStore } from "./useGameStore";
import { settleBagAfterSession } from "@/lib/sessionReward";
import {
  applyBagSynergy,
  bagCellCount,
  packInventory,
  BAG_ROWS_MIN,
  BAG_ROWS_MAX,
  BAG_TRAY_CAP,
} from "@/lib/upHeroBag";
import { createDefaultHero, sellPrice } from "@/types/uphero";
import type { Equipment, EquipSlot } from "@/types/uphero";
import type { Category, Rarity } from "@/types/card";

const savedSpy = vi.mocked(saveToStorage);

function makeItem(
  id: string,
  type: EquipSlot,
  opts: {
    rarity?: Rarity;
    category?: Category;
    stats?: Equipment["stats"];
    bagX?: number;
    bagY?: number;
    bagRot?: number;
  } = {},
): Equipment {
  const item: Equipment = {
    id,
    baseId: `base_${type}`,
    name: id,
    type,
    category: opts.category ?? "fitness",
    rarity: opts.rarity ?? "normal",
    iconName: "Sword",
    stats: opts.stats ?? { str: 1 },
    enhanceLevel: 0,
  } as Equipment;
  if (opts.bagX !== undefined) item.bagX = opts.bagX;
  if (opts.bagY !== undefined) item.bagY = opts.bagY;
  if (opts.bagRot !== undefined) item.bagRot = opts.bagRot;
  return item;
}

/** 이 테스트의 기준 보드는 확장 0회 (BAG_ROWS_MIN 행). */
function seed(inventory: Equipment[], equipped: Partial<Record<EquipSlot, Equipment>> = {}) {
  useGameStore.setState({
    progress: { ...useGameStore.getState().progress, level: 1 },
  });
  useUpHeroStore.setState({
    hero: { ...createDefaultHero(), equipped },
    inventory,
    coins: 0,
    heroStartLevel: 1,
    bagRowsBought: 0,
    isLoaded: true,
    uiBagOpen: false,
  });
  savedSpy.mockClear();
}

const inv = () => useUpHeroStore.getState().inventory;
const byId = (id: string) => inv().find((i) => i.id === id);

/** 자기 own property 로 undefined 를 들고 있는 아이템이 있는가 (Firestore 폭탄). */
function hasUndefinedOwnProp(items: Equipment[]): boolean {
  return items.some((item) =>
    Object.keys(item).some(
      (k) =>
        Object.prototype.hasOwnProperty.call(item, k) &&
        (item as unknown as Record<string, unknown>)[k] === undefined,
    ),
  );
}

/** 좌표 키가 셋 다 없는가 (= 정리 대기 트레이). */
function isInTray(item: Equipment): boolean {
  return (
    !Object.prototype.hasOwnProperty.call(item, "bagX") &&
    !Object.prototype.hasOwnProperty.call(item, "bagY") &&
    !Object.prototype.hasOwnProperty.call(item, "bagRot")
  );
}

beforeEach(() => {
  seed([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("currentBagRows", () => {
  it("상점에서 산 행 수만이 근거다 — 레벨은 행을 못 늘린다", () => {
    expect(currentBagRows(useUpHeroStore.getState())).toBe(BAG_ROWS_MIN);
    // 챌린지 레벨을 끝까지 올려도 보드는 그대로다 (2026-09-05 결정).
    useGameStore.setState({
      progress: { ...useGameStore.getState().progress, level: 60 },
    });
    expect(currentBagRows(useUpHeroStore.getState())).toBe(BAG_ROWS_MIN);
    useUpHeroStore.setState({ bagRowsBought: 2 });
    expect(currentBagRows(useUpHeroStore.getState())).toBe(BAG_ROWS_MIN + 2);
    // 인자 없이 부르면 현재 스토어 상태를 읽는다.
    expect(currentBagRows()).toBe(BAG_ROWS_MIN + 2);
    // 손상 값도 판독 계약(normalizeBagRowsBought)대로 접힌다.
    useUpHeroStore.setState({ bagRowsBought: 99 });
    expect(currentBagRows(useUpHeroStore.getState())).toBe(BAG_ROWS_MAX);
  });
});

describe("purchaseBagRow", () => {
  it("가격이 점증하고 코인만큼 깎이며 행이 하나씩 는다", () => {
    seed([]);
    useUpHeroStore.setState({ coins: 700 });
    expect(useUpHeroStore.getState().purchaseBagRow()).toBe("ok");
    expect(useUpHeroStore.getState().coins).toBe(500);
    expect(useUpHeroStore.getState().bagRowsBought).toBe(1);
    expect(currentBagRows(useUpHeroStore.getState())).toBe(BAG_ROWS_MIN + 1);
    // 두 번째 행은 400 — 같은 값이 아니라 점증한다.
    expect(useUpHeroStore.getState().purchaseBagRow()).toBe("ok");
    expect(useUpHeroStore.getState().coins).toBe(100);
    expect(useUpHeroStore.getState().bagRowsBought).toBe(2);

    // persist 페이로드에 실려야 다음 로드에서 행이 유지된다.
    const last = savedSpy.mock.calls[savedSpy.mock.calls.length - 1];
    expect(last[0]).toBe("uphero");
    expect(last[1]).toMatchObject({ bagRowsBought: 2, coins: 100 });
  });

  it("코인이 모자라면 noCoin — 상태도 persist 도 건드리지 않는다", () => {
    seed([]);
    useUpHeroStore.setState({ coins: 199 });
    expect(useUpHeroStore.getState().purchaseBagRow()).toBe("noCoin");
    expect(useUpHeroStore.getState().coins).toBe(199);
    expect(useUpHeroStore.getState().bagRowsBought).toBe(0);
    expect(savedSpy).not.toHaveBeenCalled();
  });

  it("다 사면 maxed — 코인이 아무리 많아도 8행에서 멈춘다", () => {
    seed([]);
    useUpHeroStore.setState({ coins: 99999, bagRowsBought: 4 });
    savedSpy.mockClear();
    expect(useUpHeroStore.getState().purchaseBagRow()).toBe("maxed");
    expect(useUpHeroStore.getState().coins).toBe(99999);
    expect(currentBagRows(useUpHeroStore.getState())).toBe(BAG_ROWS_MAX);
    expect(savedSpy).not.toHaveBeenCalled();
  });
});

describe("placeItem", () => {
  it("빈 칸에 놓으면 좌표가 붙고 persist 된다", () => {
    seed([makeItem("a", "accessory")]);
    const r = useUpHeroStore.getState().placeItem("a", 0, 3, 0);
    expect(r).toEqual({ ok: true });
    expect(byId("a")).toMatchObject({ bagX: 0, bagY: 3, bagRot: 0 });
    expect(savedSpy).toHaveBeenCalledTimes(1);
    expect(savedSpy.mock.calls[0][0]).toBe("uphero");
  });

  it("다른 아이템 위에는 놓지 못한다 (상태·persist 무변동)", () => {
    seed([
      makeItem("a", "accessory", { bagX: 0, bagY: 3, bagRot: 0 }),
      makeItem("b", "accessory"),
    ]);
    const before = inv();
    expect(useUpHeroStore.getState().placeItem("b", 0, 3, 0)).toEqual({
      ok: false,
      reason: "overlap",
    });
    expect(inv()).toBe(before);
    expect(savedSpy).not.toHaveBeenCalled();
  });

  it("십자 칸도 overlap 이다 (앵커·영웅 칸은 가방칸이 아니다)", () => {
    seed([makeItem("a", "accessory")]);
    expect(useUpHeroStore.getState().placeItem("a", 2, 1, 0)).toEqual({
      ok: false,
      reason: "overlap",
    });
  });

  it("보드 밖은 outOfBounds — 회전으로 삐져나가는 경우까지", () => {
    seed([makeItem("w", "weapon")]);
    expect(useUpHeroStore.getState().placeItem("w", 5, 0, 0)).toEqual({
      ok: false,
      reason: "outOfBounds",
    });
    // 세로 1x2 의 원점이 마지막 행이면 아래 칸이 보드 밖.
    expect(
      useUpHeroStore.getState().placeItem("w", 0, BAG_ROWS_MIN - 1, 0),
    ).toEqual({ ok: false, reason: "outOfBounds" });
    // 가로로 눕히면 같은 자리에 들어간다.
    expect(useUpHeroStore.getState().placeItem("w", 0, BAG_ROWS_MIN - 1, 1)).toEqual({
      ok: true,
    });
  });

  it("없는 id 는 notFound", () => {
    seed([makeItem("a", "accessory")]);
    expect(useUpHeroStore.getState().placeItem("nope", 0, 3, 0)).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(savedSpy).not.toHaveBeenCalled();
  });

  it("자기 자리 안에서의 재배치는 자기 자신과 겹치지 않는다", () => {
    seed([makeItem("w", "weapon", { bagX: 0, bagY: 3, bagRot: 0 })]);
    // (0,3)-(0,4) 를 차지한 채 원점을 그대로 두고 회전 — 자기 칸은 무시해야 한다.
    expect(useUpHeroStore.getState().placeItem("w", 0, 3, 1)).toEqual({ ok: true });
    expect(byId("w")).toMatchObject({ bagX: 0, bagY: 3, bagRot: 1 });
  });
});

describe("setBagOpen", () => {
  it("비영속 플래그라 persist 하지 않는다", () => {
    seed([]);
    useUpHeroStore.getState().setBagOpen(true);
    expect(useUpHeroStore.getState().uiBagOpen).toBe(true);
    useUpHeroStore.getState().setBagOpen(false);
    expect(useUpHeroStore.getState().uiBagOpen).toBe(false);
    expect(savedSpy).not.toHaveBeenCalled();
  });
});

describe("장착 · 해제", () => {
  it("착용하면 좌표 키가 사라지고, 교체 아이템이 같은 자리·같은 index 를 물려받는다", () => {
    const wornBefore = makeItem("old", "weapon", { rarity: "rare" });
    seed(
      [
        makeItem("new", "weapon", { bagX: 0, bagY: 0, bagRot: 1 }),
        makeItem("filler", "accessory", { bagX: 4, bagY: 0 }),
      ],
      { weapon: wornBefore },
    );
    useUpHeroStore.getState().equipItem("new", "weapon");

    const worn = useUpHeroStore.getState().hero.equipped.weapon as Equipment;
    expect(worn.id).toBe("new");
    expect(isInTray(worn)).toBe(true);

    // 벗겨진 아이템이 비워진 footprint 를 그대로 받는다 (같은 슬롯 = 같은 모양).
    expect(inv()[0]).toMatchObject({ id: "old", bagX: 0, bagY: 0, bagRot: 1 });
    expect(inv()[1].id).toBe("filler");
    expect(hasUndefinedOwnProp(inv())).toBe(false);
  });

  it("교체가 아니면 인벤토리에서 빠지기만 한다", () => {
    seed([makeItem("new", "weapon", { bagX: 0, bagY: 0, bagRot: 0 })]);
    useUpHeroStore.getState().equipItem("new", "weapon");
    expect(inv()).toHaveLength(0);
    expect(isInTray(useUpHeroStore.getState().hero.equipped.weapon as Equipment)).toBe(
      true,
    );
  });

  it("해제는 첫 빈 자리로 들어간다", () => {
    seed([makeItem("a", "accessory", { bagX: 0, bagY: 0 })], {
      weapon: makeItem("w", "weapon"),
    });
    useUpHeroStore.getState().unequipItem("weapon");
    // (0,0) 은 차 있고 (1,0)·(3,0) 은 앵커에 막혀 1x2 가 못 들어간다 → (4,0).
    expect(byId("w")).toMatchObject({ bagX: 4, bagY: 0, bagRot: 0 });
  });

  it("자리가 없으면 해제는 정리 대기 트레이로 떨어진다 (실패하지 않는다)", () => {
    // 시작 보드의 가방칸을 1x1 로 전부 채운다.
    const full = packInventory(
      Array.from({ length: bagCellCount(BAG_ROWS_MIN) }, (_, i) =>
        makeItem(`f${i}`, "accessory"),
      ),
      BAG_ROWS_MIN,
    );
    expect(full.every((it) => it.bagX !== undefined)).toBe(true);
    seed(full, { weapon: makeItem("w", "weapon") });
    useUpHeroStore.getState().unequipItem("weapon");
    const w = byId("w") as Equipment;
    expect(isInTray(w)).toBe(true);
    expect(hasUndefinedOwnProp(inv())).toBe(false);
  });
});

describe("탐험 정산 — 트레이 초과 자동 판매", () => {
  it("최저 등급 먼저, 같은 등급이면 오래된 것 먼저 판다", () => {
    const board = packInventory(
      Array.from({ length: bagCellCount(BAG_ROWS_MIN) }, (_, i) =>
        makeItem(`f${i}`, "accessory"),
      ),
      BAG_ROWS_MIN,
    );
    // 보드가 꽉 찼으므로 아래 아이템은 전부 트레이로 간다.
    const trayRarities: Rarity[] = [
      "normal",
      "rare",
      "normal",
      "legend",
      "rare",
      "normal",
      "unique",
      "rare",
    ];
    const tray = trayRarities.map((rarity, i) =>
      makeItem(`t${i}`, "accessory", { rarity }),
    );
    const dropRarities: Rarity[] = ["normal", "rare", "normal", "unique", "normal"];
    const drops = dropRarities.map((rarity, i) =>
      makeItem(`d${i}`, "accessory", { rarity }),
    );

    const out = settleBagAfterSession([...board, ...tray], drops, BAG_ROWS_MIN);

    // 트레이 13 개 → 소프트캡 10 초과분 3 개가 팔린다. 판매 후보는 **이번 드롭만**이라
    //   기존 트레이(t*)는 건드리지 않고 드롭 중 최저 등급(normal) 세 개가 index 순으로 팔린다.
    expect(out.sold.map((s) => s.id)).toEqual(["d0", "d2", "d4"]);
    expect(out.coins).toBe(sellPrice("normal", undefined, undefined) * 3);
    expect(out.inventory).toHaveLength(board.length + tray.length + drops.length - 3);
    const stillTray = out.inventory.filter((it) => isInTray(it));
    expect(stillTray).toHaveLength(BAG_TRAY_CAP);
    expect(stillTray.map((it) => it.id)).toEqual([
      ...tray.map((it) => it.id),
      "d1",
      "d3",
    ]);
    // 트레이 왕복에서 undefined own property 가 생기면 클라우드 업로드가 throw 한다.
    expect(hasUndefinedOwnProp(out.inventory)).toBe(false);
    expect(hasUndefinedOwnProp(out.sold)).toBe(false);
  });

  it("이미 갖고 있던 트레이 아이템은 캡을 넘어도 절대 자동 판매되지 않는다 (격자 도입 전 저장본 보호)", () => {
    const board = packInventory(
      Array.from({ length: bagCellCount(BAG_ROWS_MIN) }, (_, i) =>
        makeItem(`f${i}`, "accessory"),
      ),
      BAG_ROWS_MIN,
    );
    // 격자 도입 전 저장본처럼 트레이가 이미 캡(10)을 넘은 상태: 12 개.
    const legacyTray = Array.from({ length: 12 }, (_, i) =>
      makeItem(`L${i}`, "accessory", { rarity: "normal" }),
    );
    const drops = [
      makeItem("d0", "accessory", { rarity: "legend" }),
      makeItem("d1", "accessory", { rarity: "normal" }),
    ];
    const out = settleBagAfterSession([...board, ...legacyTray], drops, BAG_ROWS_MIN);
    // 기존 트레이(12)만으로 이미 캡(10)이라 이번 드롭은 한 개도 팔지 않는다. 여기서
    //   초과분(4)만큼 팔면 후보가 늘 초과분보다 적어 새 전리품이 매 정산마다 전부 증발한다.
    expect(out.sold).toEqual([]);
    expect(out.coins).toBe(0);
    // 기존 12 개 + 새 드롭 2 개가 전부 트레이에 남는다.
    const stillTray = out.inventory.filter((it) => isInTray(it));
    expect(stillTray.map((it) => it.id)).toEqual([
      ...legacyTray.map((it) => it.id),
      "d0",
      "d1",
    ]);
  });

  it("자리가 남으면 드롭이 보드에 들어가고 아무것도 팔리지 않는다", () => {
    const out = settleBagAfterSession(
      [makeItem("a", "accessory", { bagX: 0, bagY: 0 })],
      [makeItem("d0", "accessory"), makeItem("d1", "weapon")],
      BAG_ROWS_MIN,
    );
    expect(out.sold).toEqual([]);
    expect(out.coins).toBe(0);
    expect(out.inventory.find((i) => i.id === "d0")).toMatchObject({ bagX: 1, bagY: 0 });
    expect(out.inventory.find((i) => i.id === "d1")).toMatchObject({
      bagX: 4,
      bagY: 0,
      bagRot: 0,
    });
  });
});

describe("가방 시너지 폴드", () => {
  it("S1 + S2 가 같은 아이템 한 개에서 함께 나온다", () => {
    // 착용 무기의 주 스탯 str 40. 무기 앵커 (2,0) 에 직교 인접한 (3,0) 에
    // 같은 카테고리 장신구 1x1 을 둔다 → S1 5% (= +2) + S2 crit +3.
    const worn = makeItem("worn", "weapon", {
      rarity: "rare",
      category: "fitness",
      stats: { str: 40 },
    });
    const hero = { ...createDefaultHero(), equipped: { weapon: worn } };
    const inventory = [
      makeItem("acc", "accessory", {
        category: "fitness",
        stats: { dex: 2 },
        bagX: 3,
        bagY: 0,
      }),
    ];
    const before = hero.baseStats;
    const after = applyBagSynergy(hero, inventory, BAG_ROWS_MIN).baseStats;
    expect(after.str).toBe(before.str + 2);
    expect(after.crit).toBe(before.crit + 3);
    expect(after.vit).toBe(before.vit);
    // 원본 hero 는 건드리지 않는다 (스냅샷 폴드).
    expect(hero.baseStats.str).toBe(before.str);
  });

  it("앵커에 닿지 않으면 아무 보너스도 없다", () => {
    const worn = makeItem("worn", "weapon", { stats: { str: 40 } });
    const hero = { ...createDefaultHero(), equipped: { weapon: worn } };
    const far = [
      makeItem("acc", "accessory", { category: "fitness", bagX: 0, bagY: 4 }),
    ];
    expect(applyBagSynergy(hero, far, BAG_ROWS_MIN).baseStats).toEqual(hero.baseStats);
  });
});
