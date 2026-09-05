/**
 * Up Hero — 격자 가방 (Backpack Hero 스타일) 순수 로직.
 *
 * 이 파일은 웹 정본이고 iOS `Models/UpHeroBag.swift` 가 1:1 미러다.
 * `scripts/bag-check.mjs` ↔ `scripts/equiv/bag.swift` 가 stdout 을 byte 단위로
 * diff 하므로, 여기의 모든 함수는 **결정적**이어야 한다: 배열 index 순서만 신뢰하고
 * Set/Map 순회 순서·RNG·시계에 의존하지 않는다.
 *
 * 보드 좌표계 (데이터): 원점 row 0 이 십자. 렌더는 `visualRow` 로 뒤집는다.
 *
 *        (2,0) weapon
 *  (1,1) armor   (2,1) HERO   (3,1) accessory
 *        (2,2) talisman
 *
 * 십자 5칸은 가방칸이 아니다. 착용 아이템은 `hero.equipped` 에 그대로 살고 앵커 칸에
 * 1칸으로 그린다(모양 무관). 가방 아이템만 `bagX/bagY/bagRot` 을 가진다.
 *
 * 용어:
 *  - placed     : 유효 좌표 + 보드 안 + 겹침 없음
 *  - suspended  : 유효 좌표지만 현재 rows 밖(레벨 하락 등). 좌표를 **지우지 않고** 트레이에 표시
 *  - unplaced   : 좌표 없음(트레이). 넘침 전용
 */

import type { Equipment, EquipSlot, Hero, HeroBaseStats } from "@/types/uphero";
import type { Rarity } from "@/types/card";

// ─── 상수 ────────────────────────────────────────────────────────────────

export const BAG_COLS = 5;
export const BAG_ROWS_MIN = 5;
export const BAG_ROWS_MAX = 8;
/** 셀 사이 간격(px/pt). 웹·iOS 공통. */
export const BAG_GAP = 4;
export const BAG_CELL_MIN = 44;
export const BAG_CELL_MAX = 56;
export const BAG_TRAY_H = 64;
export const BAG_ACTION_H = 56;
/** 정리 대기(미배치) 트레이 소프트캡. 초과분은 탐험 정산에서 자동 판매. */
export const BAG_TRAY_CAP = 10;

export interface BagCell {
  x: number;
  y: number;
}

export const BAG_HERO_CELL: BagCell = { x: 2, y: 1 };

export const BAG_ANCHORS: Record<EquipSlot, BagCell> = {
  weapon: { x: 2, y: 0 },
  armor: { x: 1, y: 1 },
  accessory: { x: 3, y: 1 },
  talisman: { x: 2, y: 2 },
};

/** 앵커 순회 순서 — 결정적 출력을 위해 고정. */
export const BAG_ANCHOR_ORDER: readonly EquipSlot[] = [
  "weapon",
  "armor",
  "accessory",
  "talisman",
];

const RARITY_RANK: Record<Rarity, number> = {
  normal: 0,
  rare: 1,
  unique: 2,
  legend: 3,
};

// ─── 보드 크기 ───────────────────────────────────────────────────────────

/** 행 수 = clamp(5 + floor(level/10), 5, 8). Lv1~9: 5, Lv10~19: 6, Lv20~29: 7, Lv30+: 8. */
export function bagRows(heroLevel: number): number {
  const lv = Number.isFinite(heroLevel) ? Math.max(1, Math.floor(heroLevel)) : 1;
  const rows = BAG_ROWS_MIN + Math.floor(lv / 10);
  return Math.min(BAG_ROWS_MAX, Math.max(BAG_ROWS_MIN, rows));
}

/** 가방칸 수 = 전체 - 십자 5칸. */
export function bagCellCount(rows: number): number {
  return BAG_COLS * rows - 5;
}

/** 십자(영웅 + 앵커 4) 칸인가. */
export function isCrossCell(x: number, y: number): boolean {
  if (x === BAG_HERO_CELL.x && y === BAG_HERO_CELL.y) return true;
  return anchorAt(x, y) !== null;
}

export function anchorAt(x: number, y: number): EquipSlot | null {
  for (const slot of BAG_ANCHOR_ORDER) {
    const a = BAG_ANCHORS[slot];
    if (a.x === x && a.y === y) return slot;
  }
  return null;
}

/** 데이터 row → 화면 row. 십자가 아래로 오도록 뒤집는다. */
export function visualRow(bagY: number, rows: number): number {
  return rows - 1 - bagY;
}

/**
 * 셀 한 변(px/pt) = clamp(44, min(폭 기준, 높이 기준), 56).
 * 폭·높이 둘 중 작은 쪽이 결정하며 44 아래로는 내려가지 않는다(보드가 넘치면 UI 가 처리).
 */
export function bagCellSize(
  width: number,
  height: number,
  rows: number,
  cols: number = BAG_COLS,
): number {
  const byW = Math.floor((width - BAG_GAP * (cols - 1)) / cols);
  const byH = Math.floor((height - BAG_GAP * (rows - 1)) / rows);
  const raw = Math.min(byW, byH);
  return Math.min(BAG_CELL_MAX, Math.max(BAG_CELL_MIN, raw));
}

// ─── 모양 ────────────────────────────────────────────────────────────────

/** 원점(좌상단) 기준 상대 오프셋 목록. */
export type BagShape = readonly BagCell[];

const SHAPE_1x1: BagShape = [{ x: 0, y: 0 }];
const SHAPE_1x2: BagShape = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
];
const SHAPE_2x1: BagShape = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
];
const SHAPE_2x2: BagShape = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/**
 * 모양은 슬롯 타입에서 파생한다(저장 안 함).
 *  weapon: 1x2 (rot 짝수 = 세로, 홀수 = 가로 2x1), armor: 2x2, accessory/talisman: 1x1.
 */
export function shapeFor(type: EquipSlot, rot: number): BagShape {
  switch (type) {
    case "weapon":
      return normalizeRot(rot) % 2 === 1 ? SHAPE_2x1 : SHAPE_1x2;
    case "armor":
      return SHAPE_2x2;
    default:
      return SHAPE_1x1;
  }
}

export function shapeCellCount(type: EquipSlot): number {
  return shapeFor(type, 0).length;
}

/** 회전이 의미 있는 타입인가 (v1: weapon 만). */
export function canRotate(type: EquipSlot): boolean {
  return type === "weapon";
}

/** 절대 칸 목록. */
export function footprint(type: EquipSlot, x: number, y: number, rot: number): BagCell[] {
  return shapeFor(type, rot).map((c) => ({ x: x + c.x, y: y + c.y }));
}

// ─── 좌표 정규화 계약 ────────────────────────────────────────────────────
//
//  n = 유한수 ? floor(n) : undefined
//  bagX 유효 iff 0 <= n < BAG_COLS,  bagY 유효 iff 0 <= n < BAG_ROWS_MAX,
//  bagRot 유효 iff 0 <= n <= 3, 아니면 0.
//  bagX 또는 bagY 가 무효면 세 키를 모두 지운다.
//  iOS `CloudEquipment` / `loadPersisted` 가 같은 규칙을 쓴다. 한쪽만 고치지 말 것.

export interface BagPlacement {
  x: number;
  y: number;
  rot: number;
}

function floorFinite(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.floor(v);
}

export function normalizeCoord(v: unknown, max: number): number | undefined {
  const n = floorFinite(v);
  if (n === undefined || n < 0 || n >= max) return undefined;
  return n;
}

export function normalizeRot(v: unknown): number {
  const n = floorFinite(v);
  if (n === undefined || n < 0 || n > 3) return 0;
  return n;
}

/** 아이템의 좌표를 계약대로 읽는다. 무효면 null (= 미배치). */
export function readPlacement(item: Equipment): BagPlacement | null {
  const x = normalizeCoord(item.bagX, BAG_COLS);
  const y = normalizeCoord(item.bagY, BAG_ROWS_MAX);
  if (x === undefined || y === undefined) return null;
  return { x, y, rot: normalizeRot(item.bagRot) };
}

export function hasPlacement(item: Equipment): boolean {
  return readPlacement(item) !== null;
}

export function withPlacement(item: Equipment, p: BagPlacement): Equipment {
  return { ...item, bagX: p.x, bagY: p.y, bagRot: normalizeRot(p.rot) };
}

/**
 * 미배치로 전환 — 키를 **삭제**한다. `bagX: undefined` 를 남기면 Firestore 페이로드가
 * throw 하므로 절대 undefined 대입으로 구현하지 않는다.
 */
export function withoutPlacement(item: Equipment): Equipment {
  const { bagX: _x, bagY: _y, bagRot: _r, ...rest } = item;
  void _x;
  void _y;
  void _r;
  return rest as Equipment;
}

/**
 * 좌표 키를 계약대로 정리한 사본. 무효면 삭제, 유효면 floor 정수와 정규화된 rot 으로 덮어쓴다.
 * 좌표가 이미 계약을 만족하면 같은 값이 다시 쓰인다(멱등).
 */
export function normalizeEquipmentPlacement(item: Equipment): Equipment {
  const p = readPlacement(item);
  if (!p) {
    // 키 자체가 없을 때만 사본을 만들지 않는다. `bagX: undefined` 처럼 **키는 있고 값이 undefined**
    // 인 경우까지 통과시키면 그대로 Firestore 페이로드에 실려 throw 하므로 반드시 삭제 경로를 탄다.
    if (!("bagX" in item) && !("bagY" in item) && !("bagRot" in item)) {
      return item;
    }
    return withoutPlacement(item);
  }
  if (item.bagX === p.x && item.bagY === p.y && item.bagRot === p.rot) return item;
  return withPlacement(item, p);
}

/** 착용 교체 시 벗겨지는 아이템이 새 착용 아이템의 자리를 그대로 상속한다 (같은 슬롯 = 같은 모양). */
export function inheritPlacement(from: Equipment, to: Equipment): Equipment {
  const p = readPlacement(from);
  return p ? withPlacement(to, p) : withoutPlacement(to);
}

// ─── 점유·배치 ───────────────────────────────────────────────────────────

/** 십자 칸 마커. 아이템 id 와 충돌하지 않는 값. */
export const BAG_CROSS_MARK = "#cross";

/**
 * 점유 배열 — 길이 BAG_COLS * rows, index = y * BAG_COLS + x.
 * null = 비어 있음, BAG_CROSS_MARK = 십자, 그 외 = 아이템 id.
 */
export type BagOccupancy = (string | null)[];

export function cellIndex(x: number, y: number): number {
  return y * BAG_COLS + x;
}

export function emptyOccupancy(rows: number): BagOccupancy {
  const occ: BagOccupancy = new Array<string | null>(BAG_COLS * rows).fill(null);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < BAG_COLS; x += 1) {
      if (isCrossCell(x, y)) occ[cellIndex(x, y)] = BAG_CROSS_MARK;
    }
  }
  return occ;
}

export type PlaceCheck = "ok" | "outOfBounds" | "overlap";

/**
 * 해당 원점·회전으로 놓을 수 있는가. `ignoreId` 는 이동 중인 자기 자신(현재 자리 무시).
 * 십자 칸은 overlap 으로 취급한다.
 */
export function checkPlacement(
  occ: BagOccupancy,
  rows: number,
  type: EquipSlot,
  x: number,
  y: number,
  rot: number,
  ignoreId?: string,
): PlaceCheck {
  const cells = footprint(type, x, y, rot);
  for (const c of cells) {
    if (c.x < 0 || c.x >= BAG_COLS || c.y < 0 || c.y >= rows) return "outOfBounds";
  }
  for (const c of cells) {
    const v = occ[cellIndex(c.x, c.y)];
    if (v !== null && v !== ignoreId) return "overlap";
  }
  return "ok";
}

/**
 * 탭한 칸 (x,y) 을 **덮는** 모든 원점 후보. 첫 후보는 탭한 칸 자체(원점), 그다음은 모양의
 * 각 오프셋만큼 원점을 당긴 것 — 1x2 세로 무기를 맨 윗줄에 탭해도 한 칸 아래 원점으로
 * 들어가게 하기 위함. 순서는 모양 정의 순서라 결정적이다.
 */
export function originsCovering(type: EquipSlot, rot: number, x: number, y: number): BagCell[] {
  const out: BagCell[] = [];
  for (const c of shapeFor(type, rot)) {
    const o = { x: x - c.x, y: y - c.y };
    if (!out.some((p) => p.x === o.x && p.y === o.y)) out.push(o);
  }
  return out;
}

/** 탭한 칸을 덮으면서 놓을 수 있는 첫 원점. 없으면 null. */
export function firstValidOriginCovering(
  occ: BagOccupancy,
  rows: number,
  type: EquipSlot,
  rot: number,
  x: number,
  y: number,
  ignoreId?: string,
): BagCell | null {
  for (const o of originsCovering(type, rot, x, y)) {
    if (checkPlacement(occ, rows, type, o.x, o.y, rot, ignoreId) === "ok") return o;
  }
  return null;
}

function occupy(occ: BagOccupancy, id: string, cells: BagCell[]): void {
  for (const c of cells) occ[cellIndex(c.x, c.y)] = id;
}

export type PlacementStatus = "placed" | "suspended" | "unplaced";

export interface BagLayout {
  rows: number;
  occupancy: BagOccupancy;
  placed: Equipment[];
  suspended: Equipment[];
  unplaced: Equipment[];
  statusById: Record<string, PlacementStatus>;
}

/**
 * 인벤토리를 배열 순서대로 스캔해 레이아웃을 확정한다. 멱등.
 *  1) 좌표 정규화 (계약) → 무효면 unplaced (키 삭제)
 *  2) footprint 가 현재 rows 밖 → suspended (좌표 유지)
 *  3) 십자·다른 아이템과 겹침 → unplaced (키 삭제, 나중 index 가 진다)
 *  4) 아니면 placed
 * 착용 아이템은 여기 들어오지 않는다(`hero.equipped` 는 스캔 대상이 아님).
 */
export function normalizeBagLayout(
  inventory: Equipment[],
  rows: number,
): { inventory: Equipment[]; layout: BagLayout } {
  const occ = emptyOccupancy(rows);
  const placed: Equipment[] = [];
  const suspended: Equipment[] = [];
  const unplaced: Equipment[] = [];
  const statusById: Record<string, PlacementStatus> = {};
  let changed = false;
  const out: Equipment[] = [];

  for (const raw of inventory) {
    const item = normalizeEquipmentPlacement(raw);
    if (item !== raw) changed = true;
    const p = readPlacement(item);
    if (!p) {
      out.push(item);
      unplaced.push(item);
      statusById[item.id] = "unplaced";
      continue;
    }
    const check = checkPlacement(occ, rows, item.type, p.x, p.y, p.rot);
    if (check === "outOfBounds") {
      out.push(item);
      suspended.push(item);
      statusById[item.id] = "suspended";
      continue;
    }
    if (check === "overlap") {
      const stripped = withoutPlacement(item);
      changed = true;
      out.push(stripped);
      unplaced.push(stripped);
      statusById[item.id] = "unplaced";
      continue;
    }
    occupy(occ, item.id, footprint(item.type, p.x, p.y, p.rot));
    out.push(item);
    placed.push(item);
    statusById[item.id] = "placed";
  }

  return {
    inventory: changed ? out : inventory,
    layout: { rows, occupancy: occ, placed, suspended, unplaced, statusById },
  };
}

/**
 * 좌상 → 우하 스캔으로 첫 자리를 찾는다. 회전 순서: preferRot 먼저, 회전 가능 타입이면 반대 방향 한 번 더.
 */
export function firstFit(
  occ: BagOccupancy,
  rows: number,
  type: EquipSlot,
  preferRot: number = 0,
): BagPlacement | null {
  const r0 = normalizeRot(preferRot);
  const rots = canRotate(type) ? [r0, (r0 + 1) % 4] : [r0];
  // 같은 방향이 두 번 들어가면 한 번만 본다.
  const seen: number[] = [];
  for (const rot of rots) {
    const parity = canRotate(type) ? rot % 2 : 0;
    if (seen.includes(parity)) continue;
    seen.push(parity);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < BAG_COLS; x += 1) {
        if (checkPlacement(occ, rows, type, x, y, rot) === "ok") return { x, y, rot };
      }
    }
  }
  return null;
}

/**
 * 아이템을 가방에 넣는다: 첫 자리에 배치, 자리가 없으면 미배치(트레이)로 append.
 * 모든 삽입 지점(정산·해제·사진 부적·합성 결과)은 이 헬퍼만 쓴다.
 */
export function placeIntoBag(inventory: Equipment[], item: Equipment, rows: number): Equipment[] {
  const { inventory: normalized, layout } = normalizeBagLayout(inventory, rows);
  const p = firstFit(layout.occupancy, rows, item.type, normalizeRot(item.bagRot));
  const next = p ? withPlacement(item, p) : withoutPlacement(item);
  return [...normalized, next];
}

/** 여러 개를 순서대로 넣는다. */
export function placeAllIntoBag(
  inventory: Equipment[],
  items: Equipment[],
  rows: number,
): Equipment[] {
  let inv = inventory;
  for (const it of items) inv = placeIntoBag(inv, it, rows);
  return inv;
}

/**
 * 전체 재배치: 기존 좌표를 버리고 배열 순서대로 first-fit. 마이그레이션(v5→v6)과
 * `packAllIfNonePlaced` 가 쓴다. 자리가 없는 아이템은 미배치.
 */
export function packInventory(inventory: Equipment[], rows: number): Equipment[] {
  const occ = emptyOccupancy(rows);
  return inventory.map((raw) => {
    const item = withoutPlacement(raw);
    const p = firstFit(occ, rows, item.type, 0);
    if (!p) return item;
    occupy(occ, item.id, footprint(item.type, p.x, p.y, p.rot));
    return withPlacement(item, p);
  });
}

/**
 * 인벤토리가 비어 있지 않은데 유효 배치가 하나도 없으면 전부 first-fit 한다.
 * iOS 는 버전 게이트가 없고, 구버전 iOS 가 좌표를 벗긴 클라우드 문서도 이 규칙으로 복구된다.
 * 유저가 아이템을 트레이로 옮기는 동작이 없으므로 "0개 배치" 는 정당한 상태가 아니다.
 * 유효성 판정은 BAG_ROWS_MAX 기준(현재 rows 와 무관)이라 레벨 하락으로 suspended 된 보드를 다시 팩하지 않는다.
 */
export function packAllIfNonePlaced(inventory: Equipment[], rows: number = BAG_ROWS_MAX): Equipment[] {
  if (inventory.length === 0) return inventory;
  if (inventory.some((it) => hasPlacement(it))) return inventory;
  return packInventory(inventory, rows);
}

// ─── 트레이 넘침 ─────────────────────────────────────────────────────────

/**
 * 트레이(미배치, suspended 제외)가 cap 을 넘으면 초과분을 고른다: 최저 등급 먼저, 같은 등급이면 오래된 index 먼저.
 * 반환 `keep` 은 원래 순서를 유지한 인벤토리, `sell` 은 판매 순서.
 *
 * `candidateIds` 가 있으면 **그 아이템만** 판매 후보다. 탐험 정산은 이번 드롭 id 를 넘겨
 * 이미 갖고 있던 아이템은 절대 자동 판매되지 않게 한다 — 격자 도입 전 저장본의 넘침(수십 개)이
 * 첫 탐험 한 번에 5~200 코인으로 증발하면 안 된다. 후보가 초과분보다 적으면 후보만 팔고
 * 트레이는 cap 을 넘긴 채 남는다(유저가 직접 정리). null 이면 트레이 전체가 후보.
 */
export function trayOverflow(
  inventory: Equipment[],
  rows: number,
  cap: number = BAG_TRAY_CAP,
  candidateIds: readonly string[] | null = null,
): { keep: Equipment[]; sell: Equipment[] } {
  const { inventory: normalized, layout } = normalizeBagLayout(inventory, rows);
  const tray = layout.unplaced;
  if (tray.length <= cap) return { keep: normalized, sell: [] };
  const excess = tray.length - cap;
  const indexed = tray
    .map((item, i) => ({ item, i }))
    .filter((e) => candidateIds === null || candidateIds.includes(e.item.id));
  indexed.sort((a, b) => {
    const ra = RARITY_RANK[a.item.rarity] ?? 0;
    const rb = RARITY_RANK[b.item.rarity] ?? 0;
    if (ra !== rb) return ra - rb;
    return a.i - b.i;
  });
  const sell = indexed.slice(0, Math.min(excess, indexed.length)).map((e) => e.item);
  const sellIds = sell.map((s) => s.id);
  const keep = normalized.filter((it) => !sellIds.includes(it.id));
  return { keep, sell };
}

// ─── 시너지 ──────────────────────────────────────────────────────────────

export type SynergyRuleId = "S1" | "S2" | "S3" | "S4" | "S6";

export interface SynergyLink {
  rule: SynergyRuleId;
  /** 기여하는 가방 아이템 id */
  sourceId: string;
  /** S1~S4: 보너스를 받는 앵커. S6: null */
  anchor: EquipSlot | null;
  /** S6: 짝이 되는 가방 아이템 id */
  partnerId?: string;
  /** 보너스 스탯 키 (S6 없음) */
  stat?: keyof HeroBaseStats;
  /** 이 링크 하나가 기여한 양 (S1 은 pct, 그 외는 flat) */
  amount?: number;
  /** 연결선을 그릴 두 칸: [가방 칸, 앵커/짝 칸] */
  cells: [BagCell, BagCell];
}

export interface BagSynergy {
  bonuses: Partial<HeroBaseStats>;
  perAnchor: Record<EquipSlot, Partial<HeroBaseStats>>;
  links: SynergyLink[];
}

export const SYNERGY_S1_PCT_PER_CELL = 5;
export const SYNERGY_S1_CAP_PCT = 30;
export const SYNERGY_S2_CRIT = 3;
export const SYNERGY_S2_CAP = 2;
export const SYNERGY_S3_VIT = 3;
export const SYNERGY_S3_CAP = 2;
export const SYNERGY_S4_CAP_PER_ANCHOR = 2;

/** 최대값 스탯 키. 동률이면 정의 순서(str/int/vit/dex/agi/crit/slotBonus). */
export function pickPrimaryStatKey(stats: Equipment["stats"]): keyof HeroBaseStats | null {
  const order: Array<keyof HeroBaseStats> = [
    "str",
    "int",
    "vit",
    "dex",
    "agi",
    "crit",
    "slotBonus",
  ];
  let best: keyof HeroBaseStats | null = null;
  let bestVal = -Infinity;
  for (const key of order) {
    const v = stats[key];
    if (v == null) continue;
    if (v > bestVal) {
      best = key;
      bestVal = v;
    }
  }
  return best;
}

export function isPhotoTalisman(item: Equipment): boolean {
  return item.type === "talisman" && typeof item.photoId === "string" && item.photoId.length > 0;
}

/** 사진 부적 S4 티어: +1 (강화 <5), +2 (5..9), +3 (>=10). 강화 +20 확장에도 10 에서 접힌다. */
export function photoSynergyAmount(enhanceLevel: number | undefined): number {
  const lv = Math.max(0, Math.min(10, Math.floor(enhanceLevel ?? 0)));
  return 1 + Math.floor(lv / 5);
}

function isOrthoAdjacent(a: BagCell, b: BagCell): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy === 1;
}

function isEightAdjacent(a: BagCell, b: BagCell): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
}

/** footprint 중 target 에 직교 인접한 첫 칸 (스캔 순서 = 모양 정의 순서). */
function orthoTouchCell(cells: BagCell[], target: BagCell): BagCell | null {
  for (const c of cells) if (isOrthoAdjacent(c, target)) return c;
  return null;
}

function eightTouchCell(cells: BagCell[], target: BagCell): BagCell | null {
  for (const c of cells) if (isEightAdjacent(c, target)) return c;
  return null;
}

function addStat(target: Partial<HeroBaseStats>, key: keyof HeroBaseStats, amount: number): void {
  target[key] = (target[key] ?? 0) + amount;
}

/**
 * 시너지 계산. 결정적: 앵커는 BAG_ANCHOR_ORDER, 가방 아이템은 배열 index 순.
 * S4 의 tie-break 는 bagY 오름차순 → bagX 오름차순.
 * 입력 inventory 는 이미 normalizeBagLayout 을 거친 것이어야 한다(placed 만 계산에 참여).
 */
export function computeBagSynergy(
  equipped: Hero["equipped"],
  inventory: Equipment[],
  rows: number,
): BagSynergy {
  const { layout } = normalizeBagLayout(inventory, rows);
  const bonuses: Partial<HeroBaseStats> = {};
  const perAnchor: Record<EquipSlot, Partial<HeroBaseStats>> = {
    weapon: {},
    armor: {},
    accessory: {},
    talisman: {},
  };
  const links: SynergyLink[] = [];

  const placed = layout.placed.map((item) => {
    const p = readPlacement(item) as BagPlacement;
    return { item, p, cells: footprint(item.type, p.x, p.y, p.rot) };
  });

  for (const slot of BAG_ANCHOR_ORDER) {
    const worn = equipped[slot];
    if (!worn) continue;
    const anchor = BAG_ANCHORS[slot];
    const primary = pickPrimaryStatKey(worn.stats);
    const wornPrimary = primary ? (worn.stats[primary] ?? 0) : 0;

    // S1 — 같은 카테고리(사진 제외), 직교 인접, footprint 칸수 × 5%, 앵커당 30% 상한
    let s1Pct = 0;
    if (primary && wornPrimary > 0) {
      for (const { item, cells } of placed) {
        if (isPhotoTalisman(item)) continue;
        if (item.category !== worn.category) continue;
        const touch = orthoTouchCell(cells, anchor);
        if (!touch) continue;
        const pct = SYNERGY_S1_PCT_PER_CELL * cells.length;
        s1Pct += pct;
        links.push({
          rule: "S1",
          sourceId: item.id,
          anchor: slot,
          stat: primary,
          amount: pct,
          cells: [touch, anchor],
        });
      }
      if (s1Pct > 0) {
        const pct = Math.min(SYNERGY_S1_CAP_PCT, s1Pct);
        const amount = Math.max(1, Math.round((wornPrimary * pct) / 100));
        addStat(perAnchor[slot], primary, amount);
        addStat(bonuses, primary, amount);
      }
    }

    // S2 — 무기 앵커 옆 가방 장신구: crit +3, 2개
    if (slot === "weapon") {
      let n = 0;
      for (const { item, cells } of placed) {
        if (n >= SYNERGY_S2_CAP) break;
        if (item.type !== "accessory") continue;
        const touch = orthoTouchCell(cells, anchor);
        if (!touch) continue;
        n += 1;
        addStat(perAnchor[slot], "crit", SYNERGY_S2_CRIT);
        addStat(bonuses, "crit", SYNERGY_S2_CRIT);
        links.push({
          rule: "S2",
          sourceId: item.id,
          anchor: slot,
          stat: "crit",
          amount: SYNERGY_S2_CRIT,
          cells: [touch, anchor],
        });
      }
    }

    // S3 — 갑옷 앵커 옆 가방 드롭 부적(사진 아님): vit +3, 2개
    if (slot === "armor") {
      let n = 0;
      for (const { item, cells } of placed) {
        if (n >= SYNERGY_S3_CAP) break;
        if (item.type !== "talisman" || isPhotoTalisman(item)) continue;
        const touch = orthoTouchCell(cells, anchor);
        if (!touch) continue;
        n += 1;
        addStat(perAnchor[slot], "vit", SYNERGY_S3_VIT);
        addStat(bonuses, "vit", SYNERGY_S3_VIT);
        links.push({
          rule: "S3",
          sourceId: item.id,
          anchor: slot,
          stat: "vit",
          amount: SYNERGY_S3_VIT,
          cells: [touch, anchor],
        });
      }
    }

    // S4 — 사진 부적 8방 인접: 착용 주 스탯 +1/+2/+3, 앵커당 2장 (bagY → bagX 순)
    if (primary) {
      const photos = placed
        .filter(({ item, cells }) => isPhotoTalisman(item) && eightTouchCell(cells, anchor) !== null)
        .sort((a, b) => (a.p.y !== b.p.y ? a.p.y - b.p.y : a.p.x - b.p.x))
        .slice(0, SYNERGY_S4_CAP_PER_ANCHOR);
      for (const { item, cells } of photos) {
        const amount = photoSynergyAmount(item.enhanceLevel);
        addStat(perAnchor[slot], primary, amount);
        addStat(bonuses, primary, amount);
        links.push({
          rule: "S4",
          sourceId: item.id,
          anchor: slot,
          stat: primary,
          amount,
          cells: [eightTouchCell(cells, anchor) as BagCell, anchor],
        });
      }
    }
  }

  // S6 — 같은 baseId·등급 가방 아이템 직교 인접: 합성 작업대 링크(스탯 없음). 각 쌍 1회 (i<j).
  for (let i = 0; i < placed.length; i += 1) {
    const a = placed[i];
    if (isPhotoTalisman(a.item) || !a.item.baseId) continue;
    for (let j = i + 1; j < placed.length; j += 1) {
      const b = placed[j];
      if (isPhotoTalisman(b.item)) continue;
      if (a.item.baseId !== b.item.baseId || a.item.rarity !== b.item.rarity) continue;
      let pair: [BagCell, BagCell] | null = null;
      outer: for (const ca of a.cells) {
        for (const cb of b.cells) {
          if (isOrthoAdjacent(ca, cb)) {
            pair = [ca, cb];
            break outer;
          }
        }
      }
      if (!pair) continue;
      links.push({ rule: "S6", sourceId: a.item.id, anchor: null, partnerId: b.item.id, cells: pair });
    }
  }

  return { bonuses, perAnchor, links };
}

/** 시너지 보너스를 baseStats 에 가산한 영웅 스냅샷. 세션 생성 직전(레벨 성장 적용 후)에 1회 적용. */
export function applyBagSynergy(hero: Hero, inventory: Equipment[], rows: number): Hero {
  const { bonuses } = computeBagSynergy(hero.equipped, inventory, rows);
  const keys = Object.keys(bonuses) as Array<keyof HeroBaseStats>;
  if (keys.length === 0) return hero;
  const baseStats: HeroBaseStats = { ...hero.baseStats };
  for (const k of keys) baseStats[k] += bonuses[k] ?? 0;
  return { ...hero, baseStats };
}
