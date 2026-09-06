// bag-check.mjs — 격자 가방(upHeroBag) 동치성 검증 (웹 측)
//
// src/lib/upHeroBag.ts 의 순수 함수를 고정 입력으로 실행해 출력 라인을 찍는다.
// Swift 측 scripts/equiv/bag.swift 가 같은 입력으로 같은 라인을 찍으면 동치.
// 두 파일은 **같은 순서·같은 픽스처**를 손으로 미러링한다 — 한쪽만 고치지 말 것.
//
// 실행: npx tsx scripts/bag-check.mjs   (러너: scripts/verify-equivalence.sh)
//
// 입력은 모두 정수다(좌표계가 정수라 부동소수 포맷 차이가 낄 자리가 없다).
// 유일한 예외가 정규화 계약 섹션인데, 웹은 unknown 을 받아 floor 까지 하는 반면
// iOS 도메인 `Equipment.bagX` 는 이미 `Int?` 다(소수·거대수 내림은 와이어 단계
// `CloudEquipment.lenientInt` 담당). 그래서 Swift 쪽은 "와이어를 통과한 뒤의 정수"를
// 같은 라벨로 넣는다 — 라벨이 원본 입력, 값이 도메인 입력이다.

import {
  BAG_ANCHOR_ORDER,
  BAG_TRAY_CAP,
  applyBagSynergy,
  bagCellCount,
  bagCellSize,
  bagRows,
  bagRowPrice,
  computeBagSynergy,
  footprint,
  normalizeBagLayout,
  packInventory,
  placeIntoBag,
  readPlacement,
  trayOverflow,
  originsCovering,
  firstValidOriginCovering,
  emptyOccupancy,
} from "../src/lib/upHeroBag.ts";

const lines = [];
const say = (s) => lines.push(s);

// ── 포맷 헬퍼 (Swift 측과 1:1) ────────────────────────────────────────────
const cell = (c) => `(${c.x},${c.y})`;
const cellList = (list) => list.map(cell).join(" ");

/** 스탯 맵 — 키 오름차순. 빈 맵은 "-". */
const statsStr = (obj) => {
  const keys = Object.keys(obj).sort();
  if (keys.length === 0) return "-";
  return keys.map((k) => `${k}=${obj[k]}`).join(" ");
};

/** HeroBaseStats 전체 — 0 인 키도 찍는다(Swift 는 구조체라 "없는 키" 개념이 없다). */
const BASE_STAT_KEYS = ["agi", "crit", "dex", "int", "slotBonus", "str", "vit"];
const baseStatsStr = (b) => BASE_STAT_KEYS.map((k) => `${k}=${b[k]}`).join(" ");

/** 인벤 한 줄 — placed 는 id@x,y,r / 나머지는 id:상태. */
const invStr = (inv, rows) => {
  const { inventory, layout } = normalizeBagLayout(inv, rows);
  return inventory
    .map((it) => {
      const st = layout.statusById[it.id];
      if (st !== "placed") return `${it.id}:${st}`;
      const p = readPlacement(it);
      return `${it.id}@${p.x},${p.y},${p.rot}`;
    })
    .join(" ");
};

const linkStr = (l) =>
  `${l.rule}:${l.sourceId}->${l.anchor ?? "-"}|${l.partnerId ?? "-"} ` +
  `${l.stat ?? "-"} ${l.amount ?? "-"} ${cell(l.cells[0])}-${cell(l.cells[1])}`;

// ── 픽스처 팩토리 ────────────────────────────────────────────────────────
// 좌표 키는 배치가 있을 때만 붙인다. `bagX: undefined` 를 남기면 웹
// `normalizeEquipmentPlacement` 의 "키 존재" 분기를 타서 Swift(값 nil)와 갈린다.
const mk = (id, type, category, rarity, opts = {}) => {
  const e = { id, name: id, type, rarity, category, iconName: "x", stats: opts.stats ?? {} };
  if (opts.baseId !== undefined) e.baseId = opts.baseId;
  if (opts.photoId !== undefined) e.photoId = opts.photoId;
  if (opts.enh !== undefined) e.enhanceLevel = opts.enh;
  return e;
};
const at = (e, x, y, r) => ({ ...e, bagX: x, bagY: y, bagRot: r });

const mkHero = (equipped) => ({
  name: "Test",
  hp: 100,
  maxHp: 100,
  baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
  equipped,
  classType: null,
  appearanceVariant: 0,
});

// ── 1. 보드 크기 ─────────────────────────────────────────────────────────
say("== 1 board ==");
// 행 수는 상점에서 산 행 수로만 정해진다 (4 + bought, 최대 8). 가격표는 다음 행의 값.
for (const b of [undefined, 0, 1, 2, 3, 4, 5, -1, 2.9]) {
  say(`bagRows(${String(b)}) = ${bagRows(b)} price=${String(bagRowPrice(b))}`);
}
for (const r of [4, 5, 6, 7, 8]) {
  say(`bagCellCount(${r}) = ${bagCellCount(r)}`);
}
for (const [w, h, r] of [
  [336, 431, 5],
  [336, 431, 8],
  [300, 300, 8],
  [390, 520, 6],
]) {
  say(`bagCellSize(${w},${h},${r}) = ${bagCellSize(w, h, r)}`);
}

// ── 2. 모양·회전 ─────────────────────────────────────────────────────────
say("== 2 footprint ==");
for (const type of ["weapon", "armor", "accessory", "talisman"]) {
  for (const rot of [0, 1, 2, 3]) {
    say(`footprint(${type},1,3,${rot}) = ${cellList(footprint(type, 1, 3, rot))}`);
  }
}

// ── 3. 좌표 정규화 계약 ──────────────────────────────────────────────────
say("== 3 normalize ==");
const contractCases = [
  ["2.7,3,7", 2.7, 3, 7],
  ["-1,3,0", -1, 3, 0],
  ["99,0,0", 99, 0, 0],
  ["0,8,0", 0, 8, 0],
  ["1e300,1,1", 1e300, 1, 1],
  ["2,2,2.9", 2, 2, 2.9],
];
for (const [label, x, y, r] of contractCases) {
  const item = at(mk("n", "accessory", "fitness", "normal"), x, y, r);
  const p = readPlacement(item);
  say(`normalize(${label}) = ${p ? `${p.x}/${p.y}/${p.rot}` : "unplaced"}`);
}

// ── 4. 14개 인벤토리: pack → normalize ───────────────────────────────────
say("== 4 pack ==");
const INV14 = [
  mk("w1", "weapon", "fitness", "normal", { baseId: "swd", stats: { str: 6 } }),
  mk("w2", "weapon", "fitness", "normal", { baseId: "swd", stats: { str: 6 } }),
  mk("am1", "armor", "nutrition", "rare", { baseId: "plt", stats: { vit: 8 } }),
  mk("am2", "armor", "nutrition", "rare", { baseId: "plt", stats: { vit: 8 } }),
  mk("ac1", "accessory", "fitness", "unique", { baseId: "rng", stats: { crit: 4 } }),
  mk("ac2", "accessory", "learning", "normal", { baseId: "bnd", stats: { agi: 3 } }),
  mk("ac3", "accessory", "social", "legend", { baseId: "amu", stats: { int: 7 } }),
  mk("tl1", "talisman", "mindfulness", "normal", { baseId: "chm", stats: { vit: 2 } }),
  mk("tl2", "talisman", "mindfulness", "rare", { baseId: "chm", stats: { vit: 3 } }),
  mk("ph1", "talisman", "fitness", "normal", { photoId: "p1", enh: 0, stats: { str: 1 } }),
  mk("ph2", "talisman", "fitness", "rare", { photoId: "p2", enh: 5, stats: { str: 2 } }),
  mk("ph3", "talisman", "productivity", "unique", { photoId: "p3", enh: 10, stats: { int: 3 } }),
  mk("w3", "weapon", "learning", "rare", { baseId: "stf", stats: { int: 5 } }),
  mk("ac4", "accessory", "nutrition", "normal", { baseId: "rng", stats: { dex: 2 } }),
];
const packed5 = packInventory(INV14, 5);
say(`pack5 = ${invStr(packed5, 5)}`);
say(`pack5@rows8 = ${invStr(packed5, 8)}`);
const packed8 = packInventory(INV14, 8);
say(`pack8 = ${invStr(packed8, 8)}`);
// rows 가 줄면(레벨 하락) 보드 밖 좌표는 지우지 않고 suspended 로 남는다.
say(`pack8@rows5 = ${invStr(packed8, 5)}`);

// ── 5. placeIntoBag 시퀀스 ───────────────────────────────────────────────
say("== 5 placeIntoBag ==");
let board = [
  at(mk("am1", "armor", "nutrition", "rare", { baseId: "plt", stats: { vit: 8 } }), 0, 3, 0),
  at(mk("w1", "weapon", "fitness", "normal", { baseId: "swd", stats: { str: 6 } }), 0, 0, 0),
  at(mk("ac1", "accessory", "fitness", "unique", { baseId: "rng", stats: { crit: 4 } }), 1, 0, 0),
  at(mk("tl1", "talisman", "mindfulness", "normal", { baseId: "chm", stats: { vit: 2 } }), 3, 2, 0),
];
say(`start = ${invStr(board, 5)}`);
const incoming = [
  mk("w2", "weapon", "fitness", "normal", { baseId: "swd", stats: { str: 6 } }),
  mk("am2", "armor", "nutrition", "rare", { baseId: "plt", stats: { vit: 8 } }),
  mk("ac2", "accessory", "learning", "normal", { baseId: "bnd", stats: { agi: 3 } }),
  mk("ph1", "talisman", "fitness", "normal", { photoId: "p1", enh: 0, stats: { str: 1 } }),
  mk("tl2", "talisman", "mindfulness", "rare", { baseId: "chm", stats: { vit: 3 } }),
  mk("w3", "weapon", "learning", "rare", { baseId: "stf", stats: { int: 5 } }),
];
incoming.forEach((it, i) => {
  board = placeIntoBag(board, it, 5);
  say(`step${i + 1} = ${invStr(board, 5)}`);
});

// ── 5b. 탭한 칸을 덮는 원점 후보 ───────────────────────────────────────
say("== 5b originsCovering ==");
for (const [type, rot, x, y] of [["accessory", 0, 3, 3], ["weapon", 0, 3, 4], ["weapon", 1, 4, 3], ["armor", 0, 1, 1], ["armor", 0, 4, 4]]) {
  say(`${type} r${rot} @${cell({ x, y })} -> ${cellList(originsCovering(type, rot, x, y))}`);
}
{
  const occ = emptyOccupancy(5);
  const cases = [["weapon", 0, 0, 4], ["weapon", 0, 2, 3], ["weapon", 0, 1, 0], ["armor", 0, 4, 4], ["armor", 0, 0, 0], ["accessory", 0, 2, 1]];
  for (const [type, rot, x, y] of cases) {
    const o = firstValidOriginCovering(occ, 5, type, rot, x, y);
    say(`first ${type} r${rot} @${cell({ x, y })} -> ${o ? cell(o) : "none"}`);
  }
}

// ── 6. 트레이 넘침 ───────────────────────────────────────────────────────
say("== 6 trayOverflow ==");
const TRAY13 = [
  mk("t01", "accessory", "fitness", "normal"),
  mk("t02", "accessory", "fitness", "rare"),
  mk("t03", "talisman", "learning", "normal"),
  mk("t04", "weapon", "social", "unique"),
  mk("t05", "armor", "nutrition", "normal"),
  mk("t06", "accessory", "learning", "legend"),
  mk("t07", "talisman", "mindfulness", "rare"),
  mk("t08", "weapon", "fitness", "normal"),
  mk("t09", "accessory", "productivity", "unique"),
  mk("t10", "armor", "social", "rare"),
  mk("t11", "talisman", "fitness", "normal"),
  mk("t12", "accessory", "nutrition", "unique"),
  mk("t13", "weapon", "learning", "rare"),
];
{
  const { keep, sell } = trayOverflow(TRAY13, 5, BAG_TRAY_CAP);
  say(`sell = ${sell.map((s) => s.id).join(" ")}`);
  say(`keep = ${keep.length}`);
  say(`keepIds = ${keep.map((s) => s.id).join(" ")}`);
  // 후보 제한: 이번 드롭만 판매 후보 (기존 아이템 보호). 후보가 초과분 이하면 한 개도 안 판다.
  const c1 = trayOverflow(TRAY13, 5, BAG_TRAY_CAP, ["t11", "t12", "t13", "t01"]);
  say(`cand sell = ${c1.sell.map((s) => s.id).join(" ")}`);
  say(`cand keep = ${c1.keep.length}`);
  const c2 = trayOverflow(TRAY13, 5, BAG_TRAY_CAP, ["t06"]);
  say(`cand1 sell = ${c2.sell.map((s) => s.id).join(" ")}`);
  say(`cand1 keep = ${c2.keep.length}`);
  const c3 = trayOverflow(TRAY13, 5, BAG_TRAY_CAP, []);
  say(`cand0 sell = ${c3.sell.length} keep = ${c3.keep.length}`);
}

// ── 6b. 기존(후보 아님) 트레이가 이미 캡을 넘긴 경우 ──────────────────────
// 격자 도입 전 저장본은 트레이가 cap 을 넘긴 채로 마이그레이션된다. 이때 초과분이
// 이번 드롭 수보다 크면 새 전리품이 매 정산마다 전부 자동 판매된다 — 그래서 후보가
// 아닌 트레이 아이템만으로 cap 이 차 있으면 한 개도 팔지 않는다.
say("== 6b trayOverflow preTray ==");
{
  const legacy = Array.from({ length: 12 }, (_, i) =>
    mk(`L${String(i).padStart(2, "0")}`, "accessory", "fitness", "normal"),
  );
  const drops = [
    mk("d0", "accessory", "fitness", "normal"),
    mk("d1", "talisman", "learning", "rare"),
  ];
  const over = trayOverflow(
    [...legacy, ...drops],
    5,
    BAG_TRAY_CAP,
    drops.map((d) => d.id),
  );
  say(`legacy sell = ${over.sell.length} keep = ${over.keep.length}`);

  const pre = Array.from({ length: 8 }, (_, i) =>
    mk(`P${i}`, "accessory", "fitness", "unique"),
  );
  const fresh = [
    mk("n0", "accessory", "fitness", "normal"),
    mk("n1", "accessory", "fitness", "rare"),
    mk("n2", "talisman", "learning", "normal"),
    mk("n3", "accessory", "social", "legend"),
    mk("n4", "talisman", "fitness", "normal"),
  ];
  const mixed = trayOverflow(
    [...pre, ...fresh],
    5,
    BAG_TRAY_CAP,
    fresh.map((d) => d.id),
  );
  say(`mixed sell = ${mixed.sell.map((s) => s.id).join(" ")}`);
  say(`mixed keep = ${mixed.keep.length}`);
}

// ── 7. 시너지 ────────────────────────────────────────────────────────────
say("== 7 synergy ==");
// 네 앵커 모두 착용. eqC 는 dex/agi 동률이라 pickPrimaryStatKey 의 정의 순서를 검증한다.
const EQUIPPED = {
  weapon: mk("eqW", "weapon", "fitness", "rare", { baseId: "eqswd", stats: { str: 20, crit: 2 } }),
  armor: mk("eqA", "armor", "nutrition", "rare", { baseId: "eqplt", stats: { vit: 17 } }),
  accessory: mk("eqC", "accessory", "learning", "unique", {
    baseId: "eqrng",
    stats: { agi: 11, dex: 11 },
  }),
  talisman: mk("eqT", "talisman", "mindfulness", "rare", { baseId: "eqchm", stats: { int: 9 } }),
};

// B1 — S1 혼합(1x1 + 1x2 + 2x2)으로 armor 앵커 35% → 30% 캡. b1c 는 무기 앵커 S2 도 낸다.
const B1 = [
  at(mk("b1a", "armor", "nutrition", "rare", { baseId: "plt", stats: { vit: 4 } }), 0, 2, 0),
  at(mk("b1b", "weapon", "nutrition", "normal", { baseId: "swd", stats: { str: 3 } }), 0, 0, 0),
  at(mk("b1c", "accessory", "nutrition", "normal", { baseId: "rng", stats: { crit: 1 } }), 1, 0, 0),
];
// B2 — 십자 둘레: 드롭 부적 3개(S3 캡 2) + 무기 앵커 옆 장신구 1개(S2).
const B2 = [
  at(mk("b2t1", "talisman", "nutrition", "normal", { baseId: "chm", stats: { vit: 2 } }), 0, 1, 0),
  at(mk("b2t2", "talisman", "nutrition", "rare", { baseId: "chm", stats: { vit: 3 } }), 1, 0, 0),
  at(mk("b2t3", "talisman", "nutrition", "normal", { baseId: "chm", stats: { vit: 2 } }), 1, 2, 0),
  at(mk("b2c1", "accessory", "fitness", "rare", { baseId: "rng", stats: { crit: 3 } }), 3, 0, 0),
];
// B3 — 사진 3장이 talisman 앵커 8방(캡 2, bagY→bagX tie-break) + b3p1 은 armor 앵커도 함께 문다.
const B3 = [
  at(mk("b3p1", "talisman", "fitness", "unique", { photoId: "q1", enh: 10, stats: { str: 3 } }), 1, 2, 0),
  at(mk("b3p2", "talisman", "fitness", "rare", { photoId: "q2", enh: 5, stats: { str: 2 } }), 3, 2, 0),
  at(mk("b3p3", "talisman", "fitness", "normal", { photoId: "q3", enh: 0, stats: { str: 1 } }), 1, 3, 0),
];
// B4 — S6 전용: 같은 baseId·등급 3개 일렬(인접 쌍 2개), 등급 다른 이웃 1개, 멀리 떨어진 1개.
const B4 = [
  at(mk("b4x", "accessory", "fitness", "rare", { baseId: "rng", stats: { crit: 1 } }), 0, 3, 0),
  at(mk("b4y", "accessory", "fitness", "rare", { baseId: "rng", stats: { crit: 1 } }), 1, 3, 0),
  at(mk("b4z", "accessory", "fitness", "rare", { baseId: "rng", stats: { crit: 1 } }), 2, 3, 0),
  at(mk("b4w", "accessory", "fitness", "unique", { baseId: "rng", stats: { crit: 2 } }), 3, 3, 0),
  at(mk("b4v", "accessory", "fitness", "rare", { baseId: "rng", stats: { crit: 1 } }), 4, 0, 0),
];

const BOARDS = [
  ["B1", B1],
  ["B2", B2],
  ["B3", B3],
  ["B4", B4],
];
for (const [name, inv] of BOARDS) {
  const syn = computeBagSynergy(EQUIPPED, inv, 5);
  say(`${name} board = ${invStr(inv, 5)}`);
  say(`${name} bonuses = ${statsStr(syn.bonuses)}`);
  for (const slot of BAG_ANCHOR_ORDER) {
    say(`${name} anchor ${slot} = ${statsStr(syn.perAnchor[slot])}`);
  }
  say(`${name} links = ${syn.links.length}`);
  for (const l of syn.links) say(`${name} link ${linkStr(l)}`);
}

// ── 8. applyBagSynergy ───────────────────────────────────────────────────
say("== 8 applyBagSynergy ==");
for (const [name, inv] of BOARDS) {
  const hero = applyBagSynergy(mkHero(EQUIPPED), inv, 5);
  say(`${name} baseStats = ${baseStatsStr(hero.baseStats)}`);
}

console.log(lines.join("\n"));
