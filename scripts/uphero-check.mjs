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
  enhanceOutcomeRates,
  getEnhanceTitle,
  enhanceRitualBand,
  getHeroAppearanceVariant,
  getEffectiveHeroLevel,
  computeEffectiveStats,
  computeHeroForLevel,
  computeStatMax,
  getBuffSlotCount,
  heroXpToNextLevel,
  heroTotalXPForLevel,
  heroLevelFromXP,
  getHeroXPProgress,
  skillPointsTotalForLevel,
  bossClearXp,
  floorXp,
  resolveHeroLevel,
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
// 5. enhanceSuccessRate — Phase 5-B: 상위 밴드 (10..19) + 밴드 pity 포함
for (const r of ["normal", "rare", "unique", "legend"]) {
  for (const lv of [0, 3, 9, 10, 14, 15, 19]) {
    for (const st of [0, 5, 15, 40]) {
      lines.push(
        `enhanceSuccessRate(${r},${lv},${st}) = ${f(enhanceSuccessRate(r, lv, st))}`,
      );
    }
  }
}
// 6. enhanceCost — 밴드 배율 (마지막 인자) 포함
for (const r of ["normal", "rare", "unique", "legend"]) {
  for (const lv of [0, 3, 9, 10, 14, 15, 19]) {
    lines.push(`enhanceCost(${r},${lv}) = ${enhanceCost(r, lv)}`);
  }
}
// 6b. enhanceOutcomeRates — 3분기 (keep 은 1e-12 미만 스냅) 10자리
for (const r of ["normal", "rare", "unique", "legend"]) {
  for (const lv of [0, 3, 9, 10, 14, 15, 19, 25]) {
    const o = enhanceOutcomeRates(r, lv);
    lines.push(
      `enhanceOutcomeRates(${r},${lv}) = ${f(o.destroy)},${f(o.down)},${f(o.keep)}`,
    );
  }
}
// 6c. getEnhanceTitle / enhanceRitualBand
for (const lv of [0, 14, 15, 19, 20]) {
  lines.push(`getEnhanceTitle(${lv}) = ${getEnhanceTitle(lv) ?? "null"}`);
}
for (const lv of [1, 10, 11, 15, 16, 20]) {
  lines.push(`enhanceRitualBand(${lv}) = ${enhanceRitualBand(lv)}`);
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
for (const cls of ["warrior", "mage", "monk", "druid", "bard", "chronomancer", "priest", "illusionist"]) {
  lines.push(
    `computeHeroForLevel(${cls},42) = ${fmtHero(computeHeroForLevel(mkHero({ classType: cls }), 42))}`,
  );
}
// 11. computeStatMax — 8개 클래스 전부 (classStatGrowth 테이블 완전 검증)
for (const [lv, cls] of [
  [1, null],
  [42, "warrior"],
  [42, "mage"],
  [42, "monk"],
  [42, "druid"],
  [42, "bard"],
  [42, "chronomancer"],
  [42, "priest"],
  [42, "illusionist"],
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

// ── Phase 2-A (Track A) — 영웅 XP 풀 곡선 / SP 파생 / XP 소스 ──────────────
// 13. heroXpToNextLevel / heroTotalXPForLevel — 표 + clamp (0, -5, 1000 → cap)
for (const lv of [0, -5, 1, 2, 5, 10, 20, 22, 30, 40, 45, 47, 50, 60, 100, 999, 1000]) {
  lines.push(`heroXpToNextLevel(${lv}) = ${heroXpToNextLevel(lv)}`);
  lines.push(`heroTotalXPForLevel(${lv}) = ${heroTotalXPForLevel(lv)}`);
}
// 14. heroLevelFromXP — 역함수 경계 + 상한 + 음수
for (const xp of [0, 120, 121, 509, 510, 1365, 5831, 12035, 39031, 331955259, 2000000000, 1000000000000, -1]) {
  lines.push(`heroLevelFromXP(${xp}) = ${heroLevelFromXP(xp)}`);
}
// 15. getHeroXPProgress
for (const [xp, lv] of [
  [0, 1],
  [1000, 1],
  [39031, 47],
  [5000, 10],
  [331955259, 999],
]) {
  const pr = getHeroXPProgress(xp, lv);
  lines.push(`getHeroXPProgress(${xp},${lv}) = ${pr.current},${pr.needed}`);
}
// 16. skillPointsTotalForLevel
for (const lv of [1, 29, 30, 31, 45, 999, 1000]) {
  lines.push(`skillPointsTotalForLevel(${lv}) = ${skillPointsTotalForLevel(lv)}`);
}
// 17. bossClearXp / floorXp / resolveHeroLevel
for (const [fl, ng] of [
  [10, 0],
  [20, 0],
  [30, 0],
  [30, 1],
  [45, 1],
  [60, 2],
  [1, 0],
]) {
  lines.push(`bossClearXp(${fl},${ng}) = ${bossClearXp(fl, ng)}`);
  lines.push(`floorXp(${fl},${ng}) = ${floorXp(fl, ng)}`);
}
for (const [xp, g, h] of [
  [undefined, 47, 1],
  [0, 47, 1],
  [245, 47, 41],
  [39031, 47, 1],
  [undefined, 43, 41],
]) {
  lines.push(`resolveHeroLevel(${lbl(xp)},${g},${lbl(h)}) = ${resolveHeroLevel(xp, g, h)}`);
}

console.log(lines.join("\n"));
