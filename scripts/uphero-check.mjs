// uphero-check.mjs — Phase 2.4 "타입" 단계 동치성 검증 (웹 측)
//
// src/types/uphero.ts 의 순수 함수 12종을 고정 입력으로 실행해 출력 라인을 찍는다.
// Swift 측(/tmp/uphero-verify/main.swift)이 같은 입력으로 같은 라인을 찍으면 동치.
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/uphero-check.mjs

import {
  ngPlusScaleMult,
  ngPlusLegendBonus,
  getISOWeekId,
  computeWeeklyScore,
  enhanceSuccessRate,
  enhanceCost,
  getHeroAppearanceVariant,
  getEffectiveHeroLevel,
  computeEffectiveStats,
  computeHeroForLevel,
  computeStatMax,
  getBuffSlotCount,
} from "../src/types/uphero.ts";

const lines = [];
const f = (x) => Number(x).toFixed(10);
const lbl = (n) => (n === undefined ? "undefined" : String(n));

// 1. ngPlusScaleMult
for (const n of [undefined, 0, 1, 2, 3, 5, -1]) {
  lines.push(`ngPlusScaleMult(${lbl(n)}) = ${f(ngPlusScaleMult(n))}`);
}
// 2. ngPlusLegendBonus
for (const n of [undefined, 0, 1, 2, 3, 5, -1]) {
  lines.push(`ngPlusLegendBonus(${lbl(n)}) = ${f(ngPlusLegendBonus(n))}`);
}
// 3. getISOWeekId
const dates = [
  "2026-05-15T12:00:00Z",
  "2026-01-01T12:00:00Z",
  "2025-12-31T12:00:00Z",
  "2024-12-30T12:00:00Z",
  "2024-12-29T12:00:00Z",
  "2027-01-04T12:00:00Z",
  "2026-12-28T12:00:00Z",
  "2023-01-01T12:00:00Z",
];
for (const ds of dates) {
  lines.push(`getISOWeekId(${ds}) = ${getISOWeekId(new Date(ds))}`);
}
// 4. computeWeeklyScore
for (const [fl, t, lv] of [
  [0, 0, 1],
  [15, 50, 10],
  [30, 100, 30],
  [45, 0, 50],
  [10, 200, 1],
]) {
  lines.push(`computeWeeklyScore(${fl},${t},${lv}) = ${computeWeeklyScore(fl, t, lv)}`);
}
// 5. enhanceSuccessRate
for (const r of ["normal", "rare", "unique", "legend"]) {
  for (const lv of [0, 3, 9]) {
    for (const st of [0, 5, 15]) {
      lines.push(
        `enhanceSuccessRate(${r},${lv},${st}) = ${f(enhanceSuccessRate(r, lv, st))}`,
      );
    }
  }
}
// 6. enhanceCost
for (const r of ["normal", "rare", "unique", "legend"]) {
  for (const lv of [0, 3, 9]) {
    lines.push(`enhanceCost(${r},${lv}) = ${enhanceCost(r, lv)}`);
  }
}
// 7. getHeroAppearanceVariant
for (const lv of [1, 9, 10, 29, 30, 50]) {
  lines.push(`getHeroAppearanceVariant(${lv}) = ${getHeroAppearanceVariant(lv)}`);
}
// 8. getEffectiveHeroLevel
for (const [g, h] of [
  [1, undefined],
  [41, 41],
  [42, 41],
  [50, 1],
  [5, 10],
]) {
  lines.push(`getEffectiveHeroLevel(${g},${lbl(h)}) = ${getEffectiveHeroLevel(g, h)}`);
}

// ── Hero / Equipment 테스트 픽스처 ──────────────────────────────
function mkHero(over = {}) {
  return {
    name: "Test",
    hp: 100,
    maxHp: 100,
    baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
    equipped: {},
    classType: null,
    appearanceVariant: 0,
    ...over,
  };
}
function mkEquip(type, stats) {
  return {
    id: type,
    name: type,
    type,
    rarity: "normal",
    category: "fitness",
    iconName: "x",
    stats,
  };
}

// 9. computeEffectiveStats
{
  const h = mkHero({
    equipped: {
      weapon: mkEquip("weapon", { str: 5, crit: 3 }),
      armor: mkEquip("armor", { vit: 8 }),
    },
  });
  const s = computeEffectiveStats(h);
  lines.push(
    `computeEffectiveStats = ${s.str},${s.int},${s.vit},${s.dex},${s.agi},${s.crit},${s.slotBonus}`,
  );
}
// 10. computeHeroForLevel
function fmtHero(r) {
  const b = r.baseStats;
  return `${r.hp},${r.maxHp},${b.str},${b.int},${b.vit},${b.dex},${b.agi},${b.crit},${b.slotBonus}`;
}
for (const lv of [1, 10, 30, 50]) {
  lines.push(`computeHeroForLevel(default,${lv}) = ${fmtHero(computeHeroForLevel(mkHero(), lv))}`);
}
lines.push(
  `computeHeroForLevel(injured,10) = ${fmtHero(computeHeroForLevel(mkHero({ hp: 50 }), 10))}`,
);
for (const cls of ["warrior", "mage"]) {
  lines.push(
    `computeHeroForLevel(${cls},42) = ${fmtHero(computeHeroForLevel(mkHero({ classType: cls }), 42))}`,
  );
}
// 11. computeStatMax
for (const [lv, cls] of [
  [1, null],
  [42, "warrior"],
  [42, "mage"],
  [30, "monk"],
  [50, null],
]) {
  const m = computeStatMax(lv, cls);
  lines.push(
    `computeStatMax(${lv},${cls}) = ${m.str},${m.int},${m.vit},${m.dex},${m.agi},${m.crit}`,
  );
}
// 12. getBuffSlotCount
const cases12 = [
  [mkHero(), 1],
  [mkHero(), 5],
  [mkHero({ equipped: { accessory: mkEquip("accessory", { slotBonus: 1 }) } }), 5],
  [
    mkHero({
      equipped: {
        accessory: mkEquip("accessory", { slotBonus: 1 }),
        talisman: mkEquip("talisman", { slotBonus: 1 }),
      },
    }),
    5,
  ],
  [
    mkHero({
      equipped: {
        accessory: mkEquip("accessory", { slotBonus: 2 }),
        talisman: mkEquip("talisman", { slotBonus: 2 }),
      },
    }),
    5,
  ],
];
cases12.forEach(([h, lv], i) => {
  lines.push(`getBuffSlotCount(case${i},${lv}) = ${getBuffSlotCount(h, lv)}`);
});

console.log(lines.join("\n"));
