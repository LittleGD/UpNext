import { describe, it, expect } from "vitest";
import {
  BAG_COLS,
  BAG_ROWS_MIN,
  BAG_ROWS_MAX,
  BAG_ROWS_BUYABLE,
  BAG_ROW_PRICES,
  BAG_GAP,
  BAG_CELL_MIN,
  BAG_CELL_MAX,
  BAG_TRAY_CAP,
  BAG_CROSS_MARK,
  BAG_ANCHORS,
  BAG_ANCHOR_ORDER,
  BAG_HERO_CELL,
  bagRows,
  bagRowPrice,
  normalizeBagRowsBought,
  bagCellCount,
  isCrossCell,
  anchorAt,
  visualRow,
  bagCellSize,
  shapeFor,
  shapeCellCount,
  canRotate,
  footprint,
  normalizeCoord,
  normalizeRot,
  readPlacement,
  hasPlacement,
  withPlacement,
  withoutPlacement,
  normalizeEquipmentPlacement,
  inheritPlacement,
  cellIndex,
  emptyOccupancy,
  checkPlacement,
  normalizeBagLayout,
  firstFit,
  placeIntoBag,
  placeAllIntoBag,
  packInventory,
  originsCovering,
  firstValidOriginCovering,
  packAllIfNonePlaced,
  trayOverflow,
  pickPrimaryStatKey,
  isPhotoTalisman,
  photoSynergyAmount,
  computeBagSynergy,
  applyBagSynergy,
  SYNERGY_S1_CAP_PCT,
  SYNERGY_S2_CRIT,
  SYNERGY_S3_VIT,
} from "@/lib/upHeroBag";
import type { BagOccupancy } from "@/lib/upHeroBag";
import type { Equipment, EquipSlot, Hero, HeroBaseStats } from "@/types/uphero";

/**
 * `src/lib/upHeroBag.ts` 회귀 테스트.
 *
 * 기대값은 플랜(§4~§6)에서 **손으로 유도**한 상수다. 구현을 다시 실행해 만든 값이 아니므로
 * 구현이 규칙에서 벗어나면 여기서 먼저 깨진다. iOS `Models/UpHeroBag.swift` 미러와
 * `scripts/equiv/bag.swift` 도 같은 숫자를 재현해야 한다.
 *
 * 보드 좌표 (데이터 원점 row 0):
 *          (2,0) weapon
 *   (1,1) armor  (2,1) HERO  (3,1) accessory
 *          (2,2) talisman
 */

// ─── 픽스처 헬퍼 ─────────────────────────────────────────────────────────

type EqOver = Partial<Equipment> & { id: string; type: EquipSlot };

function eq(over: EqOver): Equipment {
  return {
    name: "테스트 장비",
    rarity: "normal",
    category: "fitness",
    iconName: "Sword",
    stats: {},
    ...over,
  };
}

/** 좌표까지 박힌 아이템 (계약을 이미 만족 → 정규화가 사본을 만들지 않는 상태). */
function placedEq(over: EqOver, x: number, y: number, rot = 0): Equipment {
  return { ...eq(over), bagX: x, bagY: y, bagRot: rot };
}

function stats(over: Partial<HeroBaseStats>): Partial<HeroBaseStats> {
  return over;
}

function makeHero(over: Partial<Hero> = {}): Hero {
  return {
    name: "테스터",
    hp: 100,
    maxHp: 100,
    baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
    equipped: {},
    classType: null,
    appearanceVariant: 0,
    ...over,
  };
}

/** 십자 마커가 찍힌 빈 점유 배열에 임의 칸을 채운다. */
function occWith(rows: number, filled: Array<[number, number]>, id = "blocker"): BagOccupancy {
  const occ = emptyOccupancy(rows);
  for (const [x, y] of filled) occ[cellIndex(x, y)] = id;
  return occ;
}

function ids(items: Equipment[]): string[] {
  return items.map((i) => i.id);
}

// ─── 보드 크기 ───────────────────────────────────────────────────────────

describe("bagRows / bagRowPrice / normalizeBagRowsBought", () => {
  it("행 수 = 4 + 상점에서 산 행 수 (레벨과 무관)", () => {
    expect(bagRows(undefined)).toBe(4);
    expect(bagRows(0)).toBe(4);
    expect(bagRows(1)).toBe(5);
    expect(bagRows(2)).toBe(6);
    expect(bagRows(3)).toBe(7);
    expect(bagRows(4)).toBe(8);
  });

  it("손상 값은 정규화 계약대로 접힌다", () => {
    expect(bagRows(5)).toBe(BAG_ROWS_MAX);
    expect(bagRows(1000)).toBe(BAG_ROWS_MAX);
    expect(bagRows(-1)).toBe(BAG_ROWS_MIN);
    expect(bagRows(Number.NaN)).toBe(BAG_ROWS_MIN);
    expect(bagRows(Number.POSITIVE_INFINITY)).toBe(BAG_ROWS_MIN);
    // floor: 2.9 장을 산 상태는 있을 수 없지만, 있어도 2 장으로 읽는다.
    expect(bagRows(2.9)).toBe(6);
  });

  it("normalizeBagRowsBought — 유한수만 floor 후 [0,4]", () => {
    expect(normalizeBagRowsBought(undefined)).toBe(0);
    expect(normalizeBagRowsBought(null)).toBe(0);
    expect(normalizeBagRowsBought("2")).toBe(0);
    expect(normalizeBagRowsBought(Number.NaN)).toBe(0);
    expect(normalizeBagRowsBought(-1)).toBe(0);
    expect(normalizeBagRowsBought(0)).toBe(0);
    expect(normalizeBagRowsBought(2.9)).toBe(2);
    expect(normalizeBagRowsBought(4)).toBe(BAG_ROWS_BUYABLE);
    expect(normalizeBagRowsBought(9)).toBe(BAG_ROWS_BUYABLE);
  });

  it("bagRowPrice — 다음 행 가격, 다 사면 null", () => {
    expect(bagRowPrice(undefined)).toBe(200);
    expect(bagRowPrice(0)).toBe(200);
    expect(bagRowPrice(1)).toBe(400);
    expect(bagRowPrice(2)).toBe(800);
    expect(bagRowPrice(3)).toBe(1500);
    expect(bagRowPrice(4)).toBeNull();
    expect(bagRowPrice(99)).toBeNull();
  });
});

describe("bagCellCount", () => {
  it("전체 칸에서 십자 5칸을 뺀다", () => {
    expect(bagCellCount(BAG_ROWS_MIN)).toBe(15);
    expect(bagCellCount(5)).toBe(20);
    expect(bagCellCount(6)).toBe(25);
    expect(bagCellCount(7)).toBe(30);
    expect(bagCellCount(8)).toBe(35);
  });
});

describe("십자·앵커 좌표", () => {
  it("십자 5칸만 isCrossCell", () => {
    const cross: Array<[number, number]> = [
      [2, 0],
      [1, 1],
      [2, 1],
      [3, 1],
      [2, 2],
    ];
    for (const [x, y] of cross) expect(isCrossCell(x, y)).toBe(true);
    let count = 0;
    for (let y = 0; y < BAG_ROWS_MAX; y += 1) {
      for (let x = 0; x < BAG_COLS; x += 1) if (isCrossCell(x, y)) count += 1;
    }
    expect(count).toBe(5);
  });

  it("가방칸은 isCrossCell 아님", () => {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [4, 1],
      [1, 2],
      [2, 3],
      [4, 4],
    ] as Array<[number, number]>) {
      expect(isCrossCell(x, y)).toBe(false);
    }
  });

  it("anchorAt 은 앵커 4칸만 반환, 영웅 칸은 null", () => {
    expect(anchorAt(2, 0)).toBe("weapon");
    expect(anchorAt(1, 1)).toBe("armor");
    expect(anchorAt(3, 1)).toBe("accessory");
    expect(anchorAt(2, 2)).toBe("talisman");
    expect(anchorAt(BAG_HERO_CELL.x, BAG_HERO_CELL.y)).toBeNull();
    expect(anchorAt(0, 0)).toBeNull();
    expect(anchorAt(-1, -1)).toBeNull();
    expect(BAG_ANCHOR_ORDER).toEqual(["weapon", "armor", "accessory", "talisman"]);
  });
});

describe("visualRow", () => {
  it("십자가 아래로 오도록 뒤집는다", () => {
    expect(visualRow(0, 5)).toBe(4);
    expect(visualRow(4, 5)).toBe(0);
    expect(visualRow(0, 8)).toBe(7);
    expect(visualRow(7, 8)).toBe(0);
    expect(visualRow(2, 8)).toBe(5);
  });
});

describe("bagCellSize", () => {
  it("세로 예산 336x431 — 5행이면 56(상한), 8행이면 50", () => {
    // byW = floor((336 - 4*4)/5) = 64, byH(5) = floor((431 - 4*4)/5) = 83 → 64 → clamp 56
    expect(bagCellSize(336, 431, 5)).toBe(BAG_CELL_MAX);
    // byH(8) = floor((431 - 7*4)/8) = floor(403/8) = 50
    expect(bagCellSize(336, 431, 8)).toBe(50);
  });

  it("작은 보드는 44 하한 (보드 넘침은 UI 가 처리)", () => {
    // byW = floor((300-16)/5) = 56, byH = floor((300-28)/8) = 34 → 34 → clamp 44
    expect(bagCellSize(300, 300, 8)).toBe(BAG_CELL_MIN);
  });

  it("gap 4 산술 — 폭이 셀+간격 합과 정확히 맞을 때", () => {
    // 5칸 * 50 + 4칸 간격 * 4 = 266
    expect(bagCellSize(266, 1000, 5)).toBe(50);
    expect(bagCellSize(265, 1000, 5)).toBe(49);
    expect(BAG_GAP).toBe(4);
  });

  it("모든 레벨 티어에서 360x431 보드는 44 이상", () => {
    for (const rows of [5, 6, 7, 8]) {
      expect(bagCellSize(336, 431, rows)).toBeGreaterThanOrEqual(BAG_CELL_MIN);
    }
  });
});

// ─── 모양·회전 ───────────────────────────────────────────────────────────

describe("shapeFor / footprint / canRotate", () => {
  it("weapon 은 rot 짝수 = 세로 1x2, 홀수 = 가로 2x1", () => {
    expect(shapeFor("weapon", 0)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(shapeFor("weapon", 1)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(shapeFor("weapon", 2)).toEqual(shapeFor("weapon", 0));
    expect(shapeFor("weapon", 3)).toEqual(shapeFor("weapon", 1));
    // 무효 rot 은 0 으로 정규화된 뒤 세로
    expect(shapeFor("weapon", 7)).toEqual(shapeFor("weapon", 0));
    expect(shapeFor("weapon", -1)).toEqual(shapeFor("weapon", 0));
  });

  it("armor 는 회전과 무관하게 2x2 4칸", () => {
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(shapeFor("armor", 0)).toEqual(cells);
    expect(shapeFor("armor", 1)).toEqual(cells);
    expect(shapeFor("armor", 3)).toEqual(cells);
  });

  it("accessory / talisman 은 1칸", () => {
    expect(shapeFor("accessory", 0)).toEqual([{ x: 0, y: 0 }]);
    expect(shapeFor("talisman", 1)).toEqual([{ x: 0, y: 0 }]);
  });

  it("shapeCellCount / canRotate", () => {
    expect(shapeCellCount("weapon")).toBe(2);
    expect(shapeCellCount("armor")).toBe(4);
    expect(shapeCellCount("accessory")).toBe(1);
    expect(shapeCellCount("talisman")).toBe(1);
    expect(canRotate("weapon")).toBe(true);
    expect(canRotate("armor")).toBe(false);
    expect(canRotate("accessory")).toBe(false);
    expect(canRotate("talisman")).toBe(false);
  });

  it("footprint 는 원점을 더한 절대 칸", () => {
    expect(footprint("weapon", 3, 2, 0)).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(footprint("weapon", 3, 2, 1)).toEqual([
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
    expect(footprint("armor", 0, 2, 0)).toEqual([
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 3 },
      { x: 1, y: 3 },
    ]);
    expect(footprint("accessory", 4, 4, 0)).toEqual([{ x: 4, y: 4 }]);
  });
});

// ─── 좌표 정규화 계약 ────────────────────────────────────────────────────

describe("normalizeCoord / normalizeRot", () => {
  it("유한수만 floor, 범위 밖은 undefined", () => {
    expect(normalizeCoord(2.7, BAG_COLS)).toBe(2);
    expect(normalizeCoord(0, BAG_COLS)).toBe(0);
    expect(normalizeCoord(4, BAG_COLS)).toBe(4);
    expect(normalizeCoord(5, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(-1, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(-0.5, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(99, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(1e300, BAG_ROWS_MAX)).toBeUndefined();
    expect(normalizeCoord("2", BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(null, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(undefined, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(Number.NaN, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(Number.POSITIVE_INFINITY, BAG_COLS)).toBeUndefined();
    expect(normalizeCoord(7, BAG_ROWS_MAX)).toBe(7);
    expect(normalizeCoord(8, BAG_ROWS_MAX)).toBeUndefined();
  });

  it("rot 은 0..3 밖이면 0", () => {
    expect(normalizeRot(0)).toBe(0);
    expect(normalizeRot(3)).toBe(3);
    expect(normalizeRot(2.9)).toBe(2);
    expect(normalizeRot(7)).toBe(0);
    expect(normalizeRot(4)).toBe(0);
    expect(normalizeRot(-1)).toBe(0);
    expect(normalizeRot("1")).toBe(0);
    expect(normalizeRot(null)).toBe(0);
    expect(normalizeRot(undefined)).toBe(0);
    expect(normalizeRot(Number.NaN)).toBe(0);
  });
});

describe("normalizeEquipmentPlacement (정규화 계약)", () => {
  it("소수 좌표는 floor", () => {
    const item = { ...eq({ id: "a", type: "accessory" }), bagX: 2.7, bagY: 1.2, bagRot: 2.9 };
    const out = normalizeEquipmentPlacement(item);
    expect(out.bagX).toBe(2);
    expect(out.bagY).toBe(1);
    expect(out.bagRot).toBe(2);
  });

  it.each([
    ["음수", -1],
    ["열 밖", 99],
    ["문자열", "2"],
    ["null", null],
    ["1e300", 1e300],
    ["NaN", Number.NaN],
  ])("무효 bagX(%s)면 세 키를 모두 삭제한다", (_label, bad) => {
    const item = {
      ...eq({ id: "a", type: "accessory" }),
      bagX: bad as unknown as number,
      bagY: 1,
      bagRot: 1,
    };
    const out = normalizeEquipmentPlacement(item);
    expect(Object.prototype.hasOwnProperty.call(out, "bagX")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagY")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagRot")).toBe(false);
    expect(hasPlacement(out)).toBe(false);
  });

  it("무효 bagY 도 세 키를 모두 삭제한다", () => {
    const item = { ...eq({ id: "a", type: "accessory" }), bagX: 1, bagY: 8, bagRot: 0 };
    const out = normalizeEquipmentPlacement(item);
    expect(Object.prototype.hasOwnProperty.call(out, "bagX")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagY")).toBe(false);
  });

  it("좌표가 유효하면 rot 만 0 으로 접는다", () => {
    const item = { ...eq({ id: "a", type: "weapon" }), bagX: 1, bagY: 2, bagRot: 7 };
    const out = normalizeEquipmentPlacement(item);
    expect(out.bagX).toBe(1);
    expect(out.bagY).toBe(2);
    expect(out.bagRot).toBe(0);
  });

  it("이미 계약을 만족하면 같은 참조 (멱등)", () => {
    const item = placedEq({ id: "a", type: "accessory" }, 3, 4, 0);
    expect(normalizeEquipmentPlacement(item)).toBe(item);
    const twice = normalizeEquipmentPlacement(normalizeEquipmentPlacement(item));
    expect(twice).toBe(item);
  });

  it("좌표 키가 아예 없으면 같은 참조", () => {
    const item = eq({ id: "a", type: "accessory" });
    expect(normalizeEquipmentPlacement(item)).toBe(item);
  });

  it("undefined 값이 남은 키는 삭제한다 (Firestore 페이로드 보호)", () => {
    const item = {
      ...eq({ id: "a", type: "accessory" }),
      bagX: undefined,
      bagY: undefined,
      bagRot: undefined,
    };
    const out = normalizeEquipmentPlacement(item);
    expect(Object.prototype.hasOwnProperty.call(out, "bagX")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagY")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagRot")).toBe(false);
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true);
  });

  it("두 번 돌려도 결과가 같다 (무효 입력 멱등)", () => {
    const item = { ...eq({ id: "a", type: "accessory" }), bagX: -3, bagY: 2, bagRot: 1 };
    const once = normalizeEquipmentPlacement(item);
    const twice = normalizeEquipmentPlacement(once);
    expect(twice).toBe(once);
  });
});

describe("readPlacement / withPlacement / withoutPlacement", () => {
  it("readPlacement 는 계약대로 읽고 무효면 null", () => {
    expect(readPlacement(placedEq({ id: "a", type: "weapon" }, 1, 2, 1))).toEqual({
      x: 1,
      y: 2,
      rot: 1,
    });
    expect(readPlacement(eq({ id: "a", type: "weapon" }))).toBeNull();
    expect(readPlacement({ ...eq({ id: "a", type: "weapon" }), bagX: 1 })).toBeNull();
  });

  it("withPlacement 는 rot 을 정규화해 넣는다", () => {
    const out = withPlacement(eq({ id: "a", type: "weapon" }), { x: 2, y: 3, rot: 9 });
    expect(out).toMatchObject({ bagX: 2, bagY: 3, bagRot: 0 });
  });

  it("withoutPlacement 는 키를 삭제한다 (undefined 대입 아님)", () => {
    const item = placedEq({ id: "a", type: "accessory" }, 1, 1, 0);
    const out = withoutPlacement(item);
    expect(Object.prototype.hasOwnProperty.call(out, "bagX")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagY")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagRot")).toBe(false);
    expect(Object.keys(out)).not.toContain("bagX");
    expect(JSON.stringify(out)).not.toContain("bagX");
    // 원본은 그대로
    expect(item.bagX).toBe(1);
  });
});

describe("inheritPlacement", () => {
  it("착용 교체 — 벗겨지는 아이템이 좌표를 상속", () => {
    const from = placedEq({ id: "old", type: "weapon" }, 3, 4, 1);
    const to = eq({ id: "new", type: "weapon" });
    const out = inheritPlacement(from, to);
    expect(out).toMatchObject({ id: "new", bagX: 3, bagY: 4, bagRot: 1 });
  });

  it("원본이 미배치면 대상의 좌표 키를 벗긴다", () => {
    const from = eq({ id: "old", type: "weapon" });
    const to = placedEq({ id: "new", type: "weapon" }, 1, 1, 0);
    const out = inheritPlacement(from, to);
    expect(Object.prototype.hasOwnProperty.call(out, "bagX")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, "bagRot")).toBe(false);
  });

  it("원본 좌표가 무효면 벗긴다", () => {
    const from = { ...eq({ id: "old", type: "weapon" }), bagX: 9, bagY: 1, bagRot: 0 };
    const to = placedEq({ id: "new", type: "weapon" }, 1, 1, 0);
    expect(hasPlacement(inheritPlacement(from, to))).toBe(false);
  });
});

// ─── 점유·충돌 ───────────────────────────────────────────────────────────

describe("emptyOccupancy", () => {
  it("5행 — 길이 25, 십자 5칸만 마킹", () => {
    const occ = emptyOccupancy(5);
    expect(occ.length).toBe(25);
    expect(occ.filter((v) => v === BAG_CROSS_MARK).length).toBe(5);
    expect(occ[cellIndex(2, 0)]).toBe(BAG_CROSS_MARK);
    expect(occ[cellIndex(1, 1)]).toBe(BAG_CROSS_MARK);
    expect(occ[cellIndex(2, 1)]).toBe(BAG_CROSS_MARK);
    expect(occ[cellIndex(3, 1)]).toBe(BAG_CROSS_MARK);
    expect(occ[cellIndex(2, 2)]).toBe(BAG_CROSS_MARK);
    expect(occ[cellIndex(0, 0)]).toBeNull();
    expect(occ[cellIndex(4, 4)]).toBeNull();
  });

  it("8행 — 길이 40, 십자는 여전히 5칸", () => {
    const occ = emptyOccupancy(8);
    expect(occ.length).toBe(40);
    expect(occ.filter((v) => v === BAG_CROSS_MARK).length).toBe(5);
    expect(occ.filter((v) => v === null).length).toBe(bagCellCount(8));
  });

  it("cellIndex = y * 5 + x", () => {
    expect(cellIndex(0, 0)).toBe(0);
    expect(cellIndex(4, 0)).toBe(4);
    expect(cellIndex(0, 1)).toBe(5);
    expect(cellIndex(2, 3)).toBe(17);
  });
});

describe("checkPlacement", () => {
  const rows = 5;

  it("가로 2칸은 x=4 에서 보드 밖", () => {
    const occ = emptyOccupancy(rows);
    expect(checkPlacement(occ, rows, "weapon", 3, 0, 1)).toBe("ok");
    expect(checkPlacement(occ, rows, "weapon", 4, 0, 1)).toBe("outOfBounds");
    expect(checkPlacement(occ, rows, "armor", 4, 3, 0)).toBe("outOfBounds");
  });

  it("세로 2칸은 y=rows-1 에서 보드 밖", () => {
    const occ = emptyOccupancy(rows);
    expect(checkPlacement(occ, rows, "weapon", 0, 3, 0)).toBe("ok");
    expect(checkPlacement(occ, rows, "weapon", 0, 4, 0)).toBe("outOfBounds");
    expect(checkPlacement(occ, rows, "accessory", 0, 5, 0)).toBe("outOfBounds");
    expect(checkPlacement(occ, rows, "accessory", -1, 0, 0)).toBe("outOfBounds");
  });

  it("십자 칸은 overlap", () => {
    const occ = emptyOccupancy(rows);
    expect(checkPlacement(occ, rows, "accessory", 2, 0, 0)).toBe("overlap"); // weapon 앵커
    expect(checkPlacement(occ, rows, "accessory", 2, 1, 0)).toBe("overlap"); // HERO
    expect(checkPlacement(occ, rows, "armor", 1, 0, 0)).toBe("overlap"); // (2,0) 침범
    expect(checkPlacement(occ, rows, "weapon", 1, 0, 0)).toBe("overlap"); // (1,1) 침범
  });

  it("다른 아이템과 겹치면 overlap, ignoreId 면 자기 자리는 통과", () => {
    const occ = occWith(rows, [[0, 0]], "mine");
    expect(checkPlacement(occ, rows, "accessory", 0, 0, 0)).toBe("overlap");
    expect(checkPlacement(occ, rows, "accessory", 0, 0, 0, "mine")).toBe("ok");
    expect(checkPlacement(occ, rows, "accessory", 0, 0, 0, "other")).toBe("overlap");
    // ignoreId 라도 십자는 통과 못 한다
    expect(checkPlacement(occ, rows, "accessory", 2, 1, 0, "mine")).toBe("overlap");
  });

  it("경계는 outOfBounds 가 overlap 보다 먼저 판정된다", () => {
    const occ = occWith(rows, [[4, 0]]);
    expect(checkPlacement(occ, rows, "weapon", 4, 0, 1)).toBe("outOfBounds");
  });
});

// ─── firstFit ────────────────────────────────────────────────────────────

describe("firstFit", () => {
  it("빈 5행 보드 — 1x1 은 (0,0)", () => {
    expect(firstFit(emptyOccupancy(5), 5, "accessory", 0)).toEqual({ x: 0, y: 0, rot: 0 });
  });

  it("빈 보드 — weapon rot 0 은 (0,0) 세로 ((0,1) 까지 차지)", () => {
    expect(firstFit(emptyOccupancy(5), 5, "weapon", 0)).toEqual({ x: 0, y: 0, rot: 0 });
  });

  it("preferRot 1 이면 가로를 먼저 시도한다", () => {
    expect(firstFit(emptyOccupancy(5), 5, "weapon", 1)).toEqual({ x: 0, y: 0, rot: 1 });
  });

  it("0행 가방칸이 다 차면 다음 1x1 은 (0,1)", () => {
    const occ = occWith(5, [
      [0, 0],
      [1, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(firstFit(occ, 5, "accessory", 0)).toEqual({ x: 0, y: 1, rot: 0 });
  });

  it("세로로 못 들어가면 회전해서 가로로 넣는다", () => {
    // 자유 칸이 (0,0),(1,0) 둘뿐 → 세로 1x2 는 어디에도 못 들어가고 가로만 가능
    const occ = occWith(5, [
      [3, 0],
      [4, 0],
      [0, 1],
      [4, 1],
      [0, 2],
      [1, 2],
      [3, 2],
      [4, 2],
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    expect(firstFit(occ, 5, "weapon", 0)).toEqual({ x: 0, y: 0, rot: 1 });
    // 1x1 은 그대로 (0,0)
    expect(firstFit(occ, 5, "accessory", 0)).toEqual({ x: 0, y: 0, rot: 0 });
    // 2x2 는 들어갈 자리가 없다
    expect(firstFit(occ, 5, "armor", 0)).toBeNull();
  });

  it("자리가 없으면 null", () => {
    const filled: Array<[number, number]> = [];
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < BAG_COLS; x += 1) filled.push([x, y]);
    const occ = occWith(5, filled);
    expect(firstFit(occ, 5, "accessory", 0)).toBeNull();
    expect(firstFit(occ, 5, "weapon", 0)).toBeNull();
  });

  it("십자를 피해 스캔한다 (armor 첫 자리는 (0,2))", () => {
    // 2x2 는 (0,0)→(1,1) 십자, (0,1)→(1,1) 십자, (3,0)→(3,1) 십자 … 로 막혀 (0,2) 가 첫 자리
    expect(firstFit(emptyOccupancy(5), 5, "armor", 0)).toEqual({ x: 0, y: 2, rot: 0 });
  });
});

// ─── normalizeBagLayout ──────────────────────────────────────────────────

describe("normalizeBagLayout", () => {
  it("변경이 없으면 같은 배열 참조를 돌려준다 (멱등)", () => {
    const inv = [
      placedEq({ id: "a", type: "accessory" }, 0, 0, 0),
      placedEq({ id: "b", type: "weapon" }, 4, 3, 0),
    ];
    const r = normalizeBagLayout(inv, 5);
    expect(r.inventory).toBe(inv);
    expect(r.layout.placed.length).toBe(2);
    expect(r.layout.statusById).toEqual({ a: "placed", b: "placed" });
    const again = normalizeBagLayout(r.inventory, 5);
    expect(again.inventory).toBe(inv);
  });

  it("겹치면 나중 index 가 지고 좌표 키를 잃는다", () => {
    const inv = [
      placedEq({ id: "first", type: "accessory" }, 0, 0, 0),
      placedEq({ id: "second", type: "accessory" }, 0, 0, 0),
    ];
    const { inventory, layout } = normalizeBagLayout(inv, 5);
    expect(inventory).not.toBe(inv);
    expect(inventory[0].bagX).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(inventory[1], "bagX")).toBe(false);
    expect(ids(layout.placed)).toEqual(["first"]);
    expect(ids(layout.unplaced)).toEqual(["second"]);
    expect(layout.statusById).toEqual({ first: "placed", second: "unplaced" });
    expect(layout.occupancy[cellIndex(0, 0)]).toBe("first");
  });

  it("십자와 겹쳐도 unplaced", () => {
    const inv = [placedEq({ id: "a", type: "accessory" }, 2, 1, 0)];
    const { layout } = normalizeBagLayout(inv, 5);
    expect(layout.statusById.a).toBe("unplaced");
  });

  it("현재 rows 밖이면 suspended — 좌표는 유지한다", () => {
    const inv = [
      placedEq({ id: "in", type: "accessory" }, 0, 4, 0),
      placedEq({ id: "out", type: "accessory" }, 0, 7, 0),
    ];
    const { inventory, layout } = normalizeBagLayout(inv, 5);
    expect(inventory).toBe(inv); // 좌표를 지우지 않으므로 변경 없음
    expect(ids(layout.suspended)).toEqual(["out"]);
    expect(inventory[1].bagY).toBe(7);
    expect(layout.statusById).toEqual({ in: "placed", out: "suspended" });
    // 행이 늘어나면 다시 placed
    expect(normalizeBagLayout(inv, 8).layout.statusById.out).toBe("placed");
  });

  it("suspended 는 칸을 점유하지 않는다", () => {
    const inv = [
      placedEq({ id: "sus", type: "weapon" }, 0, 4, 0), // (0,4),(0,5) → rows 5 밖
      placedEq({ id: "ok", type: "accessory" }, 0, 4, 0),
    ];
    const { layout } = normalizeBagLayout(inv, 5);
    expect(layout.statusById).toEqual({ sus: "suspended", ok: "placed" });
  });

  it("무효 좌표는 unplaced 로 떨어지고 키가 삭제된다", () => {
    const inv = [{ ...eq({ id: "a", type: "accessory" }), bagX: 9, bagY: 0, bagRot: 0 }];
    const { inventory, layout } = normalizeBagLayout(inv, 5);
    expect(layout.statusById.a).toBe("unplaced");
    expect(Object.prototype.hasOwnProperty.call(inventory[0], "bagX")).toBe(false);
  });

  it("결과 인벤토리 순서는 입력 순서 그대로", () => {
    const inv = [
      placedEq({ id: "a", type: "accessory" }, 0, 0, 0),
      eq({ id: "b", type: "accessory" }),
      placedEq({ id: "c", type: "accessory" }, 0, 0, 0),
    ];
    const { inventory } = normalizeBagLayout(inv, 5);
    expect(ids(inventory)).toEqual(["a", "b", "c"]);
  });
});

// ─── placeIntoBag / pack ─────────────────────────────────────────────────

describe("placeIntoBag / placeAllIntoBag", () => {
  it("빈 가방이면 (0,0)", () => {
    const out = placeIntoBag([], eq({ id: "a", type: "accessory" }), 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ bagX: 0, bagY: 0, bagRot: 0 });
  });

  it("weapon 의 기존 rot 을 선호 회전으로 쓴다", () => {
    const item = { ...eq({ id: "w", type: "weapon" }), bagRot: 1 };
    const out = placeIntoBag([], item, 5);
    expect(out[0]).toMatchObject({ bagX: 0, bagY: 0, bagRot: 1 });
  });

  it("보드가 꽉 차면 좌표 없이 트레이로 들어간다", () => {
    const items = Array.from({ length: bagCellCount(5) }, (_, i) =>
      eq({ id: `f${i}`, type: "accessory" }),
    );
    const full = placeAllIntoBag([], items, 5);
    expect(full).toHaveLength(20);
    expect(full.every((it) => hasPlacement(it))).toBe(true);

    const over = placeIntoBag(full, eq({ id: "over", type: "accessory" }), 5);
    const last = over[over.length - 1];
    expect(last.id).toBe("over");
    expect(Object.prototype.hasOwnProperty.call(last, "bagX")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(last, "bagRot")).toBe(false);
  });

  it("2x2 가 안 들어가도 1x1 은 들어간다 (모양 인식 용량)", () => {
    // 5행에서 armor 자리를 모두 막고 1칸만 비워둔다
    const items = Array.from({ length: bagCellCount(5) - 1 }, (_, i) =>
      eq({ id: `f${i}`, type: "accessory" }),
    );
    const near = placeAllIntoBag([], items, 5);
    const withArmor = placeIntoBag(near, eq({ id: "armor", type: "armor" }), 5);
    expect(hasPlacement(withArmor[withArmor.length - 1])).toBe(false);
    const withRing = placeIntoBag(near, eq({ id: "ring", type: "accessory" }), 5);
    expect(hasPlacement(withRing[withRing.length - 1])).toBe(true);
  });

  it("placeAllIntoBag 은 입력 순서를 유지한다", () => {
    const items = [
      eq({ id: "a", type: "weapon" }),
      eq({ id: "b", type: "armor" }),
      eq({ id: "c", type: "talisman" }),
    ];
    const out = placeAllIntoBag([eq({ id: "z", type: "accessory" })], items, 5);
    expect(ids(out)).toEqual(["z", "a", "b", "c"]);
  });
});

describe("packInventory / packAllIfNonePlaced", () => {
  const mixed = (): Equipment[] => [
    eq({ id: "w1", type: "weapon" }),
    eq({ id: "a1", type: "armor" }),
    eq({ id: "c1", type: "accessory" }),
    eq({ id: "t1", type: "talisman" }),
    eq({ id: "w2", type: "weapon" }),
    eq({ id: "a2", type: "armor" }),
    eq({ id: "c2", type: "accessory" }),
    eq({ id: "t2", type: "talisman" }),
  ];

  it("결정적 — 같은 입력이면 같은 출력", () => {
    expect(packInventory(mixed(), 5)).toEqual(packInventory(mixed(), 5));
  });

  it("빈 보드에 순차 placeIntoBag 한 것과 같다", () => {
    expect(packInventory(mixed(), 5)).toEqual(placeAllIntoBag([], mixed(), 5));
  });

  it("기존 좌표를 버리고 배열 순서로 다시 깐다", () => {
    const inv = [
      placedEq({ id: "a", type: "accessory" }, 4, 4, 0),
      placedEq({ id: "b", type: "accessory" }, 0, 4, 0),
    ];
    const out = packInventory(inv, 5);
    expect(out[0]).toMatchObject({ id: "a", bagX: 0, bagY: 0 });
    expect(out[1]).toMatchObject({ id: "b", bagX: 1, bagY: 0 });
  });

  it("packAllIfNonePlaced — 빈 인벤은 그대로", () => {
    const inv: Equipment[] = [];
    expect(packAllIfNonePlaced(inv, 5)).toBe(inv);
  });

  it("packAllIfNonePlaced — 하나라도 배치돼 있으면 손대지 않는다", () => {
    const inv = [
      placedEq({ id: "a", type: "accessory" }, 4, 4, 0),
      eq({ id: "b", type: "accessory" }),
    ];
    expect(packAllIfNonePlaced(inv, 5)).toBe(inv);
  });

  it("packAllIfNonePlaced — 전부 미배치면 first-fit 으로 깐다", () => {
    const inv = [
      eq({ id: "a", type: "accessory" }),
      eq({ id: "b", type: "weapon" }),
      eq({ id: "c", type: "armor" }),
    ];
    const out = packAllIfNonePlaced(inv, 5);
    expect(out).not.toBe(inv);
    expect(out[0]).toMatchObject({ bagX: 0, bagY: 0, bagRot: 0 });
    expect(out.every((it) => hasPlacement(it))).toBe(true);
  });

  it("packAllIfNonePlaced 기본 rows 는 8 (레벨 하락 보드를 다시 팩하지 않게)", () => {
    const inv = [eq({ id: "a", type: "accessory" })];
    expect(packAllIfNonePlaced(inv)).toEqual(packAllIfNonePlaced(inv, BAG_ROWS_MAX));
    // 8행 기준으로 배치된 아이템은 이미 hasPlacement → 다시 팩되지 않는다
    const packed = packAllIfNonePlaced(
      Array.from({ length: 30 }, (_, i) => eq({ id: `x${i}`, type: "accessory" })),
    );
    expect(packAllIfNonePlaced(packed, 5)).toBe(packed);
  });

  it("8행에서 깐 보드를 5행으로 정규화하면 아래 행이 suspended (좌표 유지)", () => {
    const items = Array.from({ length: 30 }, (_, i) => eq({ id: `x${i}`, type: "accessory" }));
    const packed = packInventory(items, 8);
    expect(packed.every((it) => hasPlacement(it))).toBe(true);
    // 8행 가방칸 누적: row0 4, row1 2, row2 4, row3 5, row4 5 → 20칸이 rows 5 안
    const { inventory, layout } = normalizeBagLayout(packed, 5);
    expect(layout.placed.length).toBe(20);
    expect(layout.suspended.length).toBe(10);
    expect(layout.unplaced.length).toBe(0);
    expect(inventory).toBe(packed); // 좌표를 지우지 않는다
    expect(layout.suspended[0].bagY).toBe(5);
    expect(layout.suspended[9].bagY).toBe(6);
    // 다시 8행으로 보면 전부 placed (멱등 복구)
    expect(normalizeBagLayout(packed, 8).layout.placed.length).toBe(30);
  });
});

// ─── 트레이 넘침 ─────────────────────────────────────────────────────────

describe("trayOverflow", () => {
  it("cap 이하면 아무것도 팔지 않는다", () => {
    const inv = Array.from({ length: BAG_TRAY_CAP }, (_, i) =>
      eq({ id: `t${i}`, type: "accessory" }),
    );
    const { keep, sell } = trayOverflow(inv, 5);
    expect(sell).toEqual([]);
    expect(ids(keep)).toEqual(ids(inv));
  });

  it("13개면 3개를 판다 — 최저 등급 먼저, 같은 등급이면 오래된 index 먼저", () => {
    const rarities = [
      "rare", // 0
      "normal", // 1
      "normal", // 2
      "legend", // 3
      "normal", // 4
      "unique", // 5
      "rare", // 6
      "normal", // 7
      "unique", // 8
      "legend", // 9
      "rare", // 10
      "normal", // 11
      "unique", // 12
    ] as const;
    const inv = rarities.map((rarity, i) => eq({ id: `t${i}`, type: "accessory", rarity }));
    const { keep, sell } = trayOverflow(inv, 5, BAG_TRAY_CAP);
    expect(ids(sell)).toEqual(["t1", "t2", "t4"]);
    expect(keep).toHaveLength(BAG_TRAY_CAP);
    expect(ids(keep)).toEqual([
      "t0",
      "t3",
      "t5",
      "t6",
      "t7",
      "t8",
      "t9",
      "t10",
      "t11",
      "t12",
    ]);
  });

  it("등급이 모두 같으면 오래된 index 부터 판다", () => {
    const inv = Array.from({ length: 12 }, (_, i) => eq({ id: `t${i}`, type: "accessory" }));
    const { sell } = trayOverflow(inv, 5, BAG_TRAY_CAP);
    expect(ids(sell)).toEqual(["t0", "t1"]);
  });

  it("배치된 아이템·suspended 는 트레이가 아니다", () => {
    // 0행 가방칸은 x = 0,1,3,4 (x=2 는 weapon 앵커)
    const rowZeroX = [0, 1, 3, 4];
    const placedItems = rowZeroX.map((x, i) =>
      placedEq({ id: `p${i}`, type: "accessory" }, x, 0, 0),
    );
    const suspended = [
      placedEq({ id: "s0", type: "accessory" }, 0, 7, 0),
      placedEq({ id: "s1", type: "accessory" }, 1, 7, 0),
    ];
    const tray = Array.from({ length: BAG_TRAY_CAP }, (_, i) =>
      eq({ id: `t${i}`, type: "accessory" }),
    );
    const { keep, sell } = trayOverflow([...placedItems, ...suspended, ...tray], 5);
    expect(sell).toEqual([]);
    expect(keep).toHaveLength(16);
  });

  it("cap 을 낮추면 그만큼 더 판다", () => {
    const inv = Array.from({ length: 5 }, (_, i) => eq({ id: `t${i}`, type: "accessory" }));
    const { sell, keep } = trayOverflow(inv, 5, 2);
    expect(ids(sell)).toEqual(["t0", "t1", "t2"]);
    expect(ids(keep)).toEqual(["t3", "t4"]);
  });
});

// ─── pickPrimaryStatKey ──────────────────────────────────────────────────

describe("pickPrimaryStatKey", () => {
  it("최대값 키를 고른다", () => {
    expect(pickPrimaryStatKey(stats({ str: 5, int: 9 }))).toBe("int");
    expect(pickPrimaryStatKey(stats({ str: 12, vit: 3, crit: 2 }))).toBe("str");
    expect(pickPrimaryStatKey(stats({ crit: 4, slotBonus: 9 }))).toBe("slotBonus");
  });

  it("동률이면 정의 순서 (str→int→vit→dex→agi→crit→slotBonus)", () => {
    expect(pickPrimaryStatKey(stats({ str: 5, int: 5 }))).toBe("str");
    expect(pickPrimaryStatKey(stats({ int: 5, vit: 5 }))).toBe("int");
    expect(pickPrimaryStatKey(stats({ vit: 2, dex: 2, agi: 2 }))).toBe("vit");
    expect(pickPrimaryStatKey(stats({ agi: 1, crit: 1, slotBonus: 1 }))).toBe("agi");
  });

  it("빈 stats 는 null, 0 만 있으면 그 키", () => {
    expect(pickPrimaryStatKey({})).toBeNull();
    expect(pickPrimaryStatKey(stats({ str: 0 }))).toBe("str");
    expect(pickPrimaryStatKey(stats({ str: -3, int: -1 }))).toBe("int");
  });
});

describe("isPhotoTalisman / photoSynergyAmount", () => {
  it("photoId 가 있는 talisman 만 사진 부적", () => {
    expect(isPhotoTalisman(eq({ id: "a", type: "talisman", photoId: "p1" }))).toBe(true);
    expect(isPhotoTalisman(eq({ id: "a", type: "talisman" }))).toBe(false);
    expect(isPhotoTalisman(eq({ id: "a", type: "talisman", photoId: "" }))).toBe(false);
    expect(isPhotoTalisman(eq({ id: "a", type: "accessory", photoId: "p1" }))).toBe(false);
  });

  it("강화 0/5/10 → +1/+2/+3, 10 에서 접힌다", () => {
    expect(photoSynergyAmount(undefined)).toBe(1);
    expect(photoSynergyAmount(0)).toBe(1);
    expect(photoSynergyAmount(4)).toBe(1);
    expect(photoSynergyAmount(5)).toBe(2);
    expect(photoSynergyAmount(9)).toBe(2);
    expect(photoSynergyAmount(10)).toBe(3);
    expect(photoSynergyAmount(20)).toBe(3);
    expect(photoSynergyAmount(-5)).toBe(1);
  });
});

// ─── 시너지 ──────────────────────────────────────────────────────────────

describe("computeBagSynergy — S1 동류", () => {
  const wornTalisman = eq({
    id: "worn-t",
    type: "talisman",
    category: "fitness",
    stats: stats({ str: 100 }),
  });
  const equipped = { talisman: wornTalisman };

  it("1x1 = 5%", () => {
    const inv = [placedEq({ id: "c1", type: "accessory", category: "fitness" }, 2, 3, 0)];
    const r = computeBagSynergy(equipped, inv, 5);
    expect(r.bonuses).toEqual({ str: 5 });
    expect(r.perAnchor.talisman).toEqual({ str: 5 });
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({
      rule: "S1",
      sourceId: "c1",
      anchor: "talisman",
      stat: "str",
      amount: 5,
      cells: [
        { x: 2, y: 3 },
        { x: 2, y: 2 },
      ],
    });
  });

  it("1x2 = 10%", () => {
    const inv = [placedEq({ id: "w1", type: "weapon", category: "fitness" }, 3, 2, 0)];
    const r = computeBagSynergy(equipped, inv, 5);
    expect(r.bonuses).toEqual({ str: 10 });
    expect(r.links[0].amount).toBe(10);
  });

  it("2x2 = 20%", () => {
    const inv = [placedEq({ id: "a1", type: "armor", category: "fitness" }, 0, 2, 0)];
    const r = computeBagSynergy(equipped, inv, 5);
    expect(r.bonuses).toEqual({ str: 20 });
    // 앵커에 닿는 첫 칸은 모양 정의 순서대로 (1,2)
    expect(r.links[0].cells[0]).toEqual({ x: 1, y: 2 });
  });

  it("앵커당 30% 상한 (2x2 + 1x2 + 1x1 = 35% → 30%)", () => {
    const inv = [
      placedEq({ id: "a1", type: "armor", category: "fitness" }, 0, 2, 0),
      placedEq({ id: "w1", type: "weapon", category: "fitness" }, 3, 2, 0),
      placedEq({ id: "c1", type: "accessory", category: "fitness" }, 2, 3, 0),
    ];
    const r = computeBagSynergy(equipped, inv, 5);
    expect(r.bonuses).toEqual({ str: SYNERGY_S1_CAP_PCT });
    expect(r.perAnchor.talisman).toEqual({ str: 30 });
    // 링크는 상한 전 개별 기여를 그대로 들고 있다 (하이라이트 용도)
    expect(r.links.map((l) => l.amount)).toEqual([20, 10, 5]);
    expect(r.links.map((l) => l.sourceId)).toEqual(["a1", "w1", "c1"]);
  });

  it("반올림 후 최소 1", () => {
    const worn = eq({ id: "w", type: "talisman", category: "fitness", stats: stats({ str: 3 }) });
    const inv = [placedEq({ id: "c1", type: "accessory", category: "fitness" }, 2, 3, 0)];
    // 3 * 5% = 0.15 → round 0 → 최소 1
    expect(computeBagSynergy({ talisman: worn }, inv, 5).bonuses).toEqual({ str: 1 });
  });

  it("팔꿈치 칸 (1,0) 은 weapon 과 armor 두 앵커에 모두 센다", () => {
    const wornWeapon = eq({
      id: "ww",
      type: "weapon",
      category: "learning",
      stats: stats({ int: 40 }),
    });
    const wornArmor = eq({
      id: "wa",
      type: "armor",
      category: "learning",
      stats: stats({ int: 40 }),
    });
    // 가로 무기 (0,0)-(1,0): (1,0) 이 (2,0) 과 (1,1) 양쪽에 직교 인접
    const inv = [placedEq({ id: "bag-w", type: "weapon", category: "learning" }, 0, 0, 1)];
    const r = computeBagSynergy({ weapon: wornWeapon, armor: wornArmor }, inv, 5);
    expect(r.bonuses).toEqual({ int: 8 });
    expect(r.perAnchor.weapon).toEqual({ int: 4 });
    expect(r.perAnchor.armor).toEqual({ int: 4 });
    expect(r.links.map((l) => l.anchor)).toEqual(["weapon", "armor"]);
    expect(r.links[0].cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(r.links[1].cells).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("사진 부적은 S1 에 참여하지 않는다 (S4 로만)", () => {
    const inv = [
      placedEq(
        { id: "photo", type: "talisman", category: "fitness", photoId: "p1" },
        2,
        3,
        0,
      ),
    ];
    const r = computeBagSynergy(equipped, inv, 5);
    expect(r.links.every((l) => l.rule !== "S1")).toBe(true);
    expect(r.links.map((l) => l.rule)).toEqual(["S4"]);
    expect(r.bonuses).toEqual({ str: 1 });
  });

  it("다른 카테고리는 S1 이 아니다", () => {
    const inv = [placedEq({ id: "c1", type: "accessory", category: "social" }, 2, 3, 0)];
    expect(computeBagSynergy(equipped, inv, 5).bonuses).toEqual({});
  });

  it("직교가 아니면 (대각) S1 이 아니다", () => {
    const inv = [placedEq({ id: "c1", type: "accessory", category: "fitness" }, 1, 3, 0)];
    expect(computeBagSynergy(equipped, inv, 5).links.some((l) => l.rule === "S1")).toBe(false);
  });

  it("suspended·unplaced 아이템은 계산에 참여하지 않는다", () => {
    const inv = [
      placedEq({ id: "sus", type: "accessory", category: "fitness" }, 2, 3, 0),
      eq({ id: "tray", type: "accessory", category: "fitness" }),
    ];
    // rows 3 이면 (2,3) 은 보드 밖 → suspended
    expect(computeBagSynergy(equipped, inv, 3).bonuses).toEqual({});
  });

  it("착용 아이템이 없는 앵커는 S1/S4 가 없다", () => {
    const inv = [
      placedEq({ id: "c1", type: "accessory", category: "fitness" }, 2, 3, 0),
      placedEq({ id: "p1", type: "talisman", category: "fitness", photoId: "px" }, 1, 2, 0),
    ];
    const r = computeBagSynergy({}, inv, 5);
    expect(r.bonuses).toEqual({});
    expect(r.links).toEqual([]);
  });
});

describe("computeBagSynergy — S2 무기+장신구", () => {
  const wornWeapon = eq({
    id: "ww",
    type: "weapon",
    category: "fitness",
    stats: stats({ str: 10 }),
  });

  it("(1,0)·(3,0) 장신구가 각각 crit +3", () => {
    const inv = [
      placedEq({ id: "r1", type: "accessory", category: "social" }, 1, 0, 0),
      placedEq({ id: "r2", type: "accessory", category: "social" }, 3, 0, 0),
    ];
    const r = computeBagSynergy({ weapon: wornWeapon }, inv, 5);
    expect(r.bonuses).toEqual({ crit: SYNERGY_S2_CRIT * 2 });
    expect(r.perAnchor.weapon).toEqual({ crit: 6 });
    expect(r.links.map((l) => l.rule)).toEqual(["S2", "S2"]);
    expect(r.links.map((l) => l.sourceId)).toEqual(["r1", "r2"]);
    expect(r.links[0]).toMatchObject({ stat: "crit", amount: 3, anchor: "weapon" });
  });

  it("weapon 앵커에 직교 인접하지 않은 장신구는 세지 않는다", () => {
    const inv = [
      placedEq({ id: "far", type: "accessory", category: "social" }, 0, 0, 0),
      placedEq({ id: "diag", type: "accessory", category: "social" }, 1, 2, 0),
    ];
    expect(computeBagSynergy({ weapon: wornWeapon }, inv, 5).bonuses).toEqual({});
  });

  it("장신구가 아니면 S2 가 아니다", () => {
    const inv = [placedEq({ id: "t", type: "talisman", category: "social" }, 1, 0, 0)];
    expect(computeBagSynergy({ weapon: wornWeapon }, inv, 5).bonuses).toEqual({});
  });

  it("무기 앵커가 아닌 곳의 장신구는 crit 을 주지 않는다", () => {
    const wornArmor = eq({
      id: "wa",
      type: "armor",
      category: "fitness",
      stats: stats({ vit: 10 }),
    });
    const inv = [placedEq({ id: "r1", type: "accessory", category: "social" }, 0, 1, 0)];
    expect(computeBagSynergy({ armor: wornArmor }, inv, 5).bonuses).toEqual({});
  });
});

describe("computeBagSynergy — S3 갑옷+부적", () => {
  const wornArmor = eq({
    id: "wa",
    type: "armor",
    category: "fitness",
    stats: stats({ vit: 10 }),
  });

  it("드롭 부적 2개까지 vit +3 (배열 순서대로)", () => {
    const inv = [
      placedEq({ id: "tC", type: "talisman", category: "social" }, 1, 2, 0),
      placedEq({ id: "tA", type: "talisman", category: "social" }, 0, 1, 0),
      placedEq({ id: "tB", type: "talisman", category: "social" }, 1, 0, 0),
    ];
    const r = computeBagSynergy({ armor: wornArmor }, inv, 5);
    expect(r.bonuses).toEqual({ vit: SYNERGY_S3_VIT * 2 });
    expect(r.perAnchor.armor).toEqual({ vit: 6 });
    expect(r.links.map((l) => l.sourceId)).toEqual(["tC", "tA"]);
    expect(r.links.every((l) => l.rule === "S3")).toBe(true);
  });

  it("사진 부적은 S3 가 아니다 (S4 로만)", () => {
    const inv = [
      placedEq({ id: "photo", type: "talisman", category: "fitness", photoId: "p1" }, 1, 0, 0),
    ];
    const r = computeBagSynergy({ armor: wornArmor }, inv, 5);
    expect(r.links.map((l) => l.rule)).toEqual(["S4"]);
    expect(r.bonuses).toEqual({ vit: 1 });
  });

  it("armor 앵커에 인접하지 않으면 세지 않는다", () => {
    const inv = [placedEq({ id: "t", type: "talisman", category: "social" }, 4, 4, 0)];
    expect(computeBagSynergy({ armor: wornArmor }, inv, 5).bonuses).toEqual({});
  });
});

describe("computeBagSynergy — S4 사진 부적 오라", () => {
  const wornTalisman = eq({
    id: "wt",
    type: "talisman",
    category: "fitness",
    stats: stats({ int: 50 }),
  });

  it("대각(8방) 인접도 센다", () => {
    const inv = [
      placedEq({ id: "diag", type: "talisman", category: "fitness", photoId: "p" }, 1, 3, 0),
    ];
    const r = computeBagSynergy({ talisman: wornTalisman }, inv, 5);
    expect(r.bonuses).toEqual({ int: 1 });
    expect(r.links[0]).toMatchObject({ rule: "S4", anchor: "talisman", stat: "int", amount: 1 });
  });

  it("강화 0/5/10/20 → +1/+2/+3/+3", () => {
    const at = (enhanceLevel: number) =>
      computeBagSynergy(
        { talisman: wornTalisman },
        [
          placedEq(
            { id: "p", type: "talisman", category: "fitness", photoId: "p", enhanceLevel },
            2,
            3,
            0,
          ),
        ],
        5,
      ).bonuses.int;
    expect(at(0)).toBe(1);
    expect(at(5)).toBe(2);
    expect(at(10)).toBe(3);
    expect(at(20)).toBe(3);
  });

  it("앵커당 2장 — bagY → bagX 순으로 고른다 (배열 순서 아님)", () => {
    const photo = (id: string, x: number, y: number, enhanceLevel: number) =>
      placedEq(
        { id, type: "talisman", category: "fitness", photoId: "p", enhanceLevel },
        x,
        y,
        0,
      );
    const inv = [
      photo("pA", 3, 3, 20), // y3 x3
      photo("pB", 2, 3, 0), // y3 x2
      photo("pC", 1, 3, 5), // y3 x1
      photo("pD", 1, 2, 10), // y2 x1 ← 최우선
    ];
    const r = computeBagSynergy({ talisman: wornTalisman }, inv, 5);
    expect(r.links.map((l) => l.sourceId)).toEqual(["pD", "pC"]);
    expect(r.links.map((l) => l.amount)).toEqual([3, 2]);
    expect(r.bonuses).toEqual({ int: 5 });
  });

  it("사진 한 장이 두 앵커에 동시에 센다", () => {
    const wornArmor = eq({
      id: "wa",
      type: "armor",
      category: "fitness",
      stats: stats({ vit: 50 }),
    });
    const inv = [
      placedEq({ id: "p1", type: "talisman", category: "fitness", photoId: "p" }, 1, 2, 0),
    ];
    const r = computeBagSynergy({ armor: wornArmor, talisman: wornTalisman }, inv, 5);
    expect(r.bonuses).toEqual({ vit: 1, int: 1 });
    expect(r.perAnchor.armor).toEqual({ vit: 1 });
    expect(r.perAnchor.talisman).toEqual({ int: 1 });
    expect(r.links.map((l) => l.anchor)).toEqual(["armor", "talisman"]);
    expect(r.links.every((l) => l.rule === "S4" && l.sourceId === "p1")).toBe(true);
  });

  it("8방 밖이면 세지 않는다", () => {
    const inv = [
      placedEq({ id: "far", type: "talisman", category: "fitness", photoId: "p" }, 4, 4, 0),
    ];
    expect(computeBagSynergy({ talisman: wornTalisman }, inv, 5).bonuses).toEqual({});
  });
});

describe("computeBagSynergy — S6 합성 작업대", () => {
  const pair = (over: Partial<Equipment>) => ({
    baseId: "ring_of_iron",
    rarity: "rare" as const,
    category: "fitness" as const,
    ...over,
  });

  it("같은 baseId·등급이 직교 인접하면 링크 1개 (anchor null)", () => {
    const inv = [
      placedEq({ id: "m1", type: "accessory", ...pair({}) }, 0, 0, 0),
      placedEq({ id: "m2", type: "accessory", ...pair({}) }, 1, 0, 0),
    ];
    const r = computeBagSynergy({}, inv, 5);
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({
      rule: "S6",
      sourceId: "m1",
      partnerId: "m2",
      anchor: null,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    expect(r.links[0].stat).toBeUndefined();
    expect(r.bonuses).toEqual({});
  });

  it("등급이 다르면 링크 없음", () => {
    const inv = [
      placedEq({ id: "m1", type: "accessory", ...pair({}) }, 0, 0, 0),
      placedEq({ id: "m2", type: "accessory", ...pair({ rarity: "unique" }) }, 1, 0, 0),
    ];
    expect(computeBagSynergy({}, inv, 5).links).toEqual([]);
  });

  it("baseId 가 다르거나 없으면 링크 없음", () => {
    const other = [
      placedEq({ id: "m1", type: "accessory", ...pair({}) }, 0, 0, 0),
      placedEq({ id: "m2", type: "accessory", ...pair({ baseId: "ring_of_gold" }) }, 1, 0, 0),
    ];
    expect(computeBagSynergy({}, other, 5).links).toEqual([]);
    const none = [
      placedEq({ id: "m1", type: "accessory" }, 0, 0, 0),
      placedEq({ id: "m2", type: "accessory" }, 1, 0, 0),
    ];
    expect(computeBagSynergy({}, none, 5).links).toEqual([]);
  });

  it("직교가 아니면 링크 없음", () => {
    const inv = [
      placedEq({ id: "m1", type: "accessory", ...pair({}) }, 0, 0, 0),
      placedEq({ id: "m2", type: "accessory", ...pair({}) }, 4, 0, 0),
    ];
    expect(computeBagSynergy({}, inv, 5).links).toEqual([]);
  });

  it("사진 부적은 S6 짝이 되지 않는다", () => {
    const inv = [
      placedEq({ id: "p1", type: "talisman", baseId: "photo", photoId: "x1" }, 0, 0, 0),
      placedEq({ id: "p2", type: "talisman", baseId: "photo", photoId: "x2" }, 1, 0, 0),
    ];
    expect(computeBagSynergy({}, inv, 5).links).toEqual([]);
  });

  it("모양이 큰 아이템도 맞닿은 칸으로 판정한다", () => {
    const inv = [
      placedEq({ id: "a1", type: "armor", ...pair({}) }, 0, 2, 0), // (0,2)(1,2)(0,3)(1,3)
      placedEq({ id: "a2", type: "armor", ...pair({}) }, 2, 3, 0), // (2,3)(3,3)(2,4)(3,4)
    ];
    const r = computeBagSynergy({}, inv, 5);
    expect(r.links).toHaveLength(1);
    expect(r.links[0].cells).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]);
  });
});

describe("computeBagSynergy — 규칙 합산", () => {
  it("한 아이템이 S1 과 S2 에 동시에 기여한다", () => {
    const wornWeapon = eq({
      id: "ww",
      type: "weapon",
      category: "fitness",
      stats: stats({ str: 100 }),
    });
    const inv = [placedEq({ id: "r1", type: "accessory", category: "fitness" }, 1, 0, 0)];
    const r = computeBagSynergy({ weapon: wornWeapon }, inv, 5);
    expect(r.bonuses).toEqual({ str: 5, crit: 3 });
    expect(r.links.map((l) => l.rule)).toEqual(["S1", "S2"]);
  });

  it("perAnchor 는 앵커별로 나뉘고 bonuses 는 총합", () => {
    const wornWeapon = eq({
      id: "ww",
      type: "weapon",
      category: "fitness",
      stats: stats({ str: 100 }),
    });
    const wornArmor = eq({
      id: "wa",
      type: "armor",
      category: "social",
      stats: stats({ vit: 100 }),
    });
    const inv = [
      placedEq({ id: "r1", type: "accessory", category: "fitness" }, 3, 0, 0),
      placedEq({ id: "t1", type: "talisman", category: "social" }, 0, 1, 0),
    ];
    const r = computeBagSynergy({ weapon: wornWeapon, armor: wornArmor }, inv, 5);
    expect(r.perAnchor.weapon).toEqual({ str: 5, crit: 3 });
    expect(r.perAnchor.armor).toEqual({ vit: 5 + 3 });
    expect(r.perAnchor.accessory).toEqual({});
    expect(r.bonuses).toEqual({ str: 5, crit: 3, vit: 8 });
  });
});

// ─── applyBagSynergy ─────────────────────────────────────────────────────

describe("applyBagSynergy", () => {
  it("보너스가 없으면 같은 hero 참조", () => {
    const h = makeHero();
    expect(applyBagSynergy(h, [], 5)).toBe(h);
    expect(applyBagSynergy(h, [eq({ id: "a", type: "accessory" })], 5)).toBe(h);
  });

  it("baseStats 에 가산한 스냅샷을 돌려주고 원본은 건드리지 않는다", () => {
    const worn = eq({
      id: "ww",
      type: "weapon",
      category: "fitness",
      stats: stats({ str: 100 }),
    });
    const h = makeHero({
      baseStats: { str: 10, int: 0, vit: 0, dex: 0, agi: 0, crit: 0, slotBonus: 0 },
      equipped: { weapon: worn },
    });
    const inv = [placedEq({ id: "r1", type: "accessory", category: "fitness" }, 1, 0, 0)];
    const out = applyBagSynergy(h, inv, 5);
    expect(out).not.toBe(h);
    expect(out.baseStats).not.toBe(h.baseStats);
    expect(out.baseStats.str).toBe(15); // 10 + round(100 * 5%)
    expect(out.baseStats.crit).toBe(3); // S2
    expect(out.baseStats.int).toBe(0);
    // 원본 불변
    expect(h.baseStats.str).toBe(10);
    expect(h.baseStats.crit).toBe(0);
    // 나머지 필드는 그대로
    expect(out.equipped).toBe(h.equipped);
    expect(out.name).toBe(h.name);
  });

  it("행 수가 줄어 suspended 되면 보너스도 사라진다", () => {
    const worn = eq({
      id: "wt",
      type: "talisman",
      category: "fitness",
      stats: stats({ str: 100 }),
    });
    const h = makeHero({ equipped: { talisman: worn } });
    const inv = [placedEq({ id: "c1", type: "accessory", category: "fitness" }, 2, 3, 0)];
    expect(applyBagSynergy(h, inv, 5).baseStats.str).toBe(h.baseStats.str + 5);
    expect(applyBagSynergy(h, inv, 3)).toBe(h);
  });
});

// ─── 상수 계약 ───────────────────────────────────────────────────────────

describe("상수", () => {
  it("iOS 미러가 같은 값을 써야 한다", () => {
    expect(BAG_COLS).toBe(5);
    expect(BAG_ROWS_MIN).toBe(4);
    expect(BAG_ROWS_BUYABLE).toBe(4);
    expect(BAG_ROW_PRICES).toEqual([200, 400, 800, 1500]);
    expect(BAG_ROWS_MAX).toBe(8);
    expect(BAG_GAP).toBe(4);
    expect(BAG_CELL_MIN).toBe(44);
    expect(BAG_CELL_MAX).toBe(56);
    expect(BAG_TRAY_CAP).toBe(10);
    expect(BAG_ANCHORS).toEqual({
      weapon: { x: 2, y: 0 },
      armor: { x: 1, y: 1 },
      accessory: { x: 3, y: 1 },
      talisman: { x: 2, y: 2 },
    });
    expect(BAG_HERO_CELL).toEqual({ x: 2, y: 1 });
  });
});

describe("trayOverflow — candidateIds (판매 후보 제한)", () => {
  const mk = (id: string, rarity: "normal" | "rare" | "unique" | "legend" = "normal") =>
    ({
      id,
      name: id,
      type: "accessory",
      rarity,
      category: "fitness",
      iconName: "Zap",
      stats: { str: 1 },
    }) as unknown as import("@/types/uphero").Equipment;
  // 5행(가방칸 20) 보드를 꽉 채우고 트레이 13 개. 시작 크기가 아니라 명시 행 수를
  //   쓰는 이유 — 이 테스트가 검증하는 건 보드 크기가 아니라 트레이 초과분 판정이다.
  const ROWS = 5;
  const board = packInventory(
    Array.from({ length: bagCellCount(ROWS) }, (_, i) => mk(`b${i}`)),
    ROWS,
  );
  const tray = [
    mk("t0"), mk("t1", "rare"), mk("t2"), mk("t3", "legend"), mk("t4", "rare"),
    mk("t5"), mk("t6", "unique"), mk("t7", "rare"), mk("t8"), mk("t9", "unique"),
    mk("t10"), mk("t11", "unique"), mk("t12", "rare"),
  ];
  const inv = [...board, ...tray];

  it("null 이면 트레이 전체가 후보 (기존 동작)", () => {
    const { sell } = trayOverflow(inv, ROWS, BAG_TRAY_CAP, null);
    expect(sell.map((s) => s.id)).toEqual(["t0", "t2", "t5"]);
  });

  it("후보 안에서만 최저 등급 → 오래된 index 순으로 초과분만큼 판다", () => {
    const { sell, keep } = trayOverflow(inv, ROWS, BAG_TRAY_CAP, [
      "t10", "t11", "t12", "t0",
    ]);
    expect(sell.map((s) => s.id)).toEqual(["t0", "t10", "t12"]);
    expect(keep).toHaveLength(inv.length - 3);
  });

  it("후보가 초과분 이하면(= 기존 트레이만으로 캡) 한 개도 팔지 않는다", () => {
    const { sell, keep } = trayOverflow(inv, ROWS, BAG_TRAY_CAP, ["t3"]);
    expect(sell).toEqual([]);
    expect(keep).toHaveLength(inv.length);
  });

  it("후보가 비어 있으면 아무것도 팔지 않는다", () => {
    const { sell, keep } = trayOverflow(inv, ROWS, BAG_TRAY_CAP, []);
    expect(sell).toEqual([]);
    expect(keep).toHaveLength(inv.length);
  });

  // 격자 도입 전 저장본은 트레이가 이미 cap 을 넘긴 채로 마이그레이션된다. 그 상태에서
  //   초과분이 이번 드롭 수보다 크면 새 전리품이 매 정산마다 전부 증발한다.
  it("후보가 아닌 트레이 아이템만으로 이미 캡이면 한 개도 팔지 않는다", () => {
    const legacyTray = Array.from({ length: 12 }, (_, i) => mk(`L${i}`));
    const drops = [mk("d0"), mk("d1", "rare")];
    const legacyInv = [...board, ...legacyTray, ...drops];
    const { sell, keep } = trayOverflow(
      legacyInv,
      ROWS,
      BAG_TRAY_CAP,
      drops.map((d) => d.id),
    );
    expect(sell).toEqual([]);
    expect(keep).toHaveLength(legacyInv.length);
  });

  it("기존 트레이 8 + 신규 5, 캡 10 이면 신규 중 3개만 판다", () => {
    const preTray = Array.from({ length: 8 }, (_, i) => mk(`P${i}`, "unique"));
    const drops = [
      mk("n0"),
      mk("n1", "rare"),
      mk("n2"),
      mk("n3", "legend"),
      mk("n4"),
    ];
    const mixedInv = [...board, ...preTray, ...drops];
    const { sell, keep } = trayOverflow(
      mixedInv,
      ROWS,
      BAG_TRAY_CAP,
      drops.map((d) => d.id),
    );
    // 트레이 13 - 캡 10 = 3. 최저 등급(normal) 먼저, 같은 등급이면 오래된 index 먼저.
    expect(sell.map((s) => s.id)).toEqual(["n0", "n2", "n4"]);
    expect(keep).toHaveLength(mixedInv.length - 3);
  });
});

describe("originsCovering / firstValidOriginCovering — 탭한 칸을 덮는 배치", () => {
  it("1x1 은 탭한 칸 하나, 1x2 세로는 [탭한 칸, 한 칸 위(데이터 y-1)] 순", () => {
    expect(originsCovering("accessory", 0, 3, 3)).toEqual([{ x: 3, y: 3 }]);
    expect(originsCovering("weapon", 0, 3, 4)).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 3 },
    ]);
    expect(originsCovering("weapon", 1, 4, 3)).toEqual([
      { x: 4, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(originsCovering("armor", 0, 1, 1)).toHaveLength(4);
  });

  it("맨 윗줄(y=rows-1)에 세로 무기를 탭하면 한 칸 아래 원점으로 들어간다", () => {
    // 5행 보드 기준 (맨 윗줄 y=4). 시작 크기와 무관하게 "윗줄 클램프" 만 본다.
    const rows = 5;
    const occ = emptyOccupancy(rows);
    expect(firstValidOriginCovering(occ, rows, "weapon", 0, 0, 4)).toEqual({ x: 0, y: 3 });
    // 십자 위(2,3)를 탭한 세로 무기: 원점 (2,3) 은 (2,4) 까지 OK.
    expect(firstValidOriginCovering(occ, rows, "weapon", 0, 2, 3)).toEqual({ x: 2, y: 3 });
    // 앵커 옆 (1,0) 을 탭한 세로 무기: (1,0)-(1,1) 은 armor 앵커에 막히고, (1,-1) 은 OOB → null.
    expect(firstValidOriginCovering(occ, rows, "weapon", 0, 1, 0)).toBeNull();
  });
});
