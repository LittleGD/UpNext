// uphero-combat-check.mjs — Phase 2.4 "전투" 동치성 검증 (웹 측)
//
// src/lib/upHeroCombat.ts 의 전투 공식/메커닉 함수를 고정 입력 + 고정 RNG seed 로
// 실행. Swift 측(/tmp/combat-verify/main.swift)이 같은 입력으로 같은 출력을 내면 동치.
// 웹 setRngSeed(seed) ≡ Swift Mulberry32(seed:) — Phase 2.3 에서 비트 단위 검증됨.
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/uphero-combat-check.mjs

import {
  computeHeroDamage,
  computeEnemyDamage,
  rollHeroOutcome,
  rollEnemyOutcome,
  isNewbieBuffActive,
  shouldNarrate,
  getBuffBoost,
  pickWeighted,
  summarizeEffects,
  summarizeEffectsData,
  applyStatAndHealBuffs,
  applyClassStartEffects,
  classXpMult,
  classCoinMult,
  classHealMult,
  classTimeMult,
  classDodgeBonus,
  classHpRegen,
  findLastEncounterIndex,
  computeMonsterHp,
  dedupeDrops,
  amplifyChoiceOptions,
  generateMysteryFloors,
  floorRewardScale,
  scaleChoiceEffectsForFloor,
  sessionStats,
} from "../src/lib/upHeroCombat.ts";
import { setRngSeed } from "../src/lib/upHeroRng.ts";

const lines = [];
const f = (x) => Number(x).toFixed(10);

function mkStats(o) {
  return { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0, ...o };
}
function mkMonster(o) {
  return {
    id: "m", name: "M", kind: "beast", level: 10, hp: 100, atk: 30, def: 10,
    xpReward: 10, coinReward: 5, dungeonId: "fitness", ...o,
  };
}
function mkHero(o) {
  return {
    name: "H", hp: 100, maxHp: 100,
    baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
    equipped: {}, classType: null, appearanceVariant: 0, ...o,
  };
}
const CLASSES = ["warrior", "mage", "monk", "druid", "bard", "chronomancer", "priest", "illusionist"];

// ── 1. isNewbieBuffActive ──────────────────────────────────────
for (const [hl, fl] of [[1, 5], [4, 10], [4, 11], [5, 5], [5, 10], [10, 3]]) {
  lines.push(`isNewbieBuffActive(${hl},${fl}) = ${isNewbieBuffActive(hl, fl)}`);
}
// ── 2. shouldNarrate ───────────────────────────────────────────
for (const o of ["hit", "crit", "dodge", "miss"]) {
  lines.push(`shouldNarrate(${o}) = ${f(shouldNarrate(o))}`);
}
// ── 3. 클래스 배율 ──────────────────────────────────────────────
for (const c of [null, ...CLASSES]) {
  lines.push(
    `classMults(${c}) = ${f(classXpMult(c))},${f(classCoinMult(c))},${f(classHealMult(c))},${f(classTimeMult(c))},${f(classDodgeBonus(c))},${classHpRegen(c)}`,
  );
}
// ── 4. computeHeroDamage (RNG) ─────────────────────────────────
const hdConfigs = [
  ["str20_def10_n", mkStats({ str: 20 }), mkMonster({ def: 10 }), false],
  ["str20_def10_c", mkStats({ str: 20 }), mkMonster({ def: 10 }), true],
  ["str50_def51_n", mkStats({ str: 50 }), mkMonster({ def: 51 }), false],
  ["str5_def0_n", mkStats({ str: 5 }), mkMonster({ def: 0 }), false],
];
for (const [name, stats, monster, crit] of hdConfigs) {
  for (let seed = 1; seed <= 8; seed++) {
    setRngSeed(seed);
    lines.push(`computeHeroDamage(${name},seed${seed}) = ${computeHeroDamage(stats, monster, crit)}`);
  }
}
// ── 5. computeEnemyDamage (RNG) ────────────────────────────────
const edConfigs = [
  ["atk30_vit20_n", mkMonster({ atk: 30 }), mkStats({ vit: 20 }), false],
  ["atk30_vit20_c", mkMonster({ atk: 30 }), mkStats({ vit: 20 }), true],
  ["boss_atk1000_vit39_c", mkMonster({ atk: 1000, isBoss: true }), mkStats({ vit: 39 }), true],
  ["atk5_vit0_n", mkMonster({ atk: 5 }), mkStats({ vit: 0 }), false],
];
for (const [name, monster, stats, crit] of edConfigs) {
  for (let seed = 1; seed <= 8; seed++) {
    setRngSeed(seed);
    lines.push(`computeEnemyDamage(${name},seed${seed}) = ${computeEnemyDamage(monster, stats, crit)}`);
  }
}
// ── 6. rollHeroOutcome (RNG) ───────────────────────────────────
const rhConfigs = [
  ["normal", mkStats({ dex: 20, crit: 10 }), mkMonster({ level: 15 }), 99],
  ["newbie", mkStats({ dex: 20, crit: 10 }), mkMonster({ level: 5 }), 2],
  ["swift", mkStats({ dex: 20, crit: 10 }), mkMonster({ level: 15, trait: "swift" }), 99],
];
for (const [name, stats, monster, hl] of rhConfigs) {
  for (let seed = 1; seed <= 12; seed++) {
    setRngSeed(seed);
    lines.push(`rollHeroOutcome(${name},seed${seed}) = ${rollHeroOutcome(stats, monster, hl)}`);
  }
}
// ── 7. rollEnemyOutcome (RNG) ──────────────────────────────────
const reConfigs = [
  ["normal", mkMonster({ level: 15 }), mkStats({ agi: 30 }), 0, 0, 0, 99],
  ["newbie", mkMonster({ level: 5 }), mkStats({ agi: 30 }), 0, 0, 0, 2],
  ["burst_bonuses", mkMonster({ level: 15, trait: "burst" }), mkStats({ agi: 30 }), 0.1, 0.05, 0.15, 99],
];
for (const [name, monster, stats, db, emb, mcb, hl] of reConfigs) {
  for (let seed = 1; seed <= 12; seed++) {
    setRngSeed(seed);
    lines.push(`rollEnemyOutcome(${name},seed${seed}) = ${rollEnemyOutcome(monster, stats, db, emb, mcb, hl)}`);
  }
}
// ── 8. pickWeighted (RNG) ──────────────────────────────────────
const pwOutcomes = [
  { weight: 70, resultText: "A", effects: [] },
  { weight: 20, resultText: "B", effects: [] },
  { weight: 10, resultText: "C", effects: [] },
];
for (let seed = 1; seed <= 10; seed++) {
  setRngSeed(seed);
  lines.push(`pickWeighted(seed${seed}) = ${pickWeighted(pwOutcomes).resultText}`);
}
// ── 9. generateMysteryFloors (RNG) ─────────────────────────────
for (const cycle of [0, 1, 2]) {
  for (let seed = 1; seed <= 6; seed++) {
    setRngSeed(seed);
    lines.push(`generateMysteryFloors(c${cycle},seed${seed}) = ${generateMysteryFloors(cycle).join(",")}`);
  }
}
// ── 10. getBuffBoost ───────────────────────────────────────────
const bb = [
  { effects: [{ kind: "special", type: "dropRate", value: 10 }, { kind: "special", type: "coinBoost", value: 20 }], description: "" },
  { effects: [{ kind: "special", type: "dropRate", value: 5 }], description: "" },
];
lines.push(`getBuffBoost(dropRate) = ${f(getBuffBoost(bb, "dropRate"))}`);
lines.push(`getBuffBoost(coinBoost) = ${f(getBuffBoost(bb, "coinBoost"))}`);
lines.push(`getBuffBoost(xpBoost) = ${f(getBuffBoost(bb, "xpBoost"))}`);
lines.push(`getBuffBoost(undefined) = ${f(getBuffBoost(undefined, "dropRate"))}`);
// ── 11. findLastEncounterIndex / computeMonsterHp ──────────────
const enc = (m) => ({ type: "encounter", monster: m, timestamp: 0 });
const cbt = (atk, dmg) => ({ type: "combat", attacker: atk, damage: dmg, outcome: "hit", timestamp: 0 });
const regenE = (amt) => ({ type: "monsterEffect", effect: "regen", amount: amt, timestamp: 0 });
const narr = { type: "narrative", text: "x", timestamp: 0 };
const vic = (m) => ({ type: "victory", monster: m, xp: 0, coins: 0, timestamp: 0 });
const mon100 = mkMonster({ hp: 100, maxHp: 100 });
const logs = [
  ["L0", [narr, enc(mon100), cbt("hero", 30), cbt("enemy", 10)]],
  ["L1", [enc(mon100), cbt("hero", 20), vic(mon100), enc(mon100), cbt("hero", 15)]],
  ["L2", [enc(mon100), cbt("hero", 25), vic(mon100)]],
  ["L3", [narr, narr]],
  ["L4", [enc(mon100), cbt("hero", 30), cbt("enemy", 10), cbt("hero", 0), regenE(5), cbt("hero", 20)]],
];
for (const [name, log] of logs) {
  const idx = findLastEncounterIndex(log);
  let hp = "-";
  if (idx >= 0) hp = computeMonsterHp(log, idx, mon100);
  lines.push(`encounterIdx/monsterHp(${name}) = ${idx},${hp}`);
}
// ── 12. dedupeDrops ────────────────────────────────────────────
const eq = (id) => ({ id, name: id, type: "weapon", rarity: "normal", category: "fitness", iconName: "x", stats: {} });
lines.push(`dedupeDrops = ${dedupeDrops([eq("A"), eq("B"), eq("A"), eq("C"), eq("B")]).map((d) => d.id).join(",")}`);
// ── 13. summarizeEffects / summarizeEffectsData ────────────────
const effSets = [
  ["mixed", [{ kind: "reward", coins: 30, xp: 50 }, { kind: "damage", amount: 10 }, { kind: "time", delta: -3 }, { kind: "heal", amount: 20 }, { kind: "reward", coins: 5 }]],
  ["posTime", [{ kind: "time", delta: 8 }, { kind: "reward", xp: 15 }]],
  ["empty", [{ kind: "fight" }, { kind: "nothing" }]],
];
for (const [name, eff] of effSets) {
  const d = summarizeEffectsData(eff);
  lines.push(`summarizeEffectsData(${name}) = xp${d.xp ?? "-"},co${d.coins ?? "-"},he${d.heal ?? "-"},da${d.damage ?? "-"},ti${d.timeDelta ?? "-"}`);
  lines.push(`summarizeEffects(${name}) = [${summarizeEffects(eff)}]`);
}
// ── 14. amplifyChoiceOptions ───────────────────────────────────
const ampOpts = [
  { label: "a", effect: { kind: "reward", coins: 10, xp: 20 } },
  { label: "b", outcomes: [{ weight: 1, resultText: "x", effects: [{ kind: "damage", amount: 5 }, { kind: "time", delta: -2 }] }] },
  { label: "c", effect: { kind: "heal", amount: 7 } },
  { label: "d", effect: { kind: "fight" } },
];
const amp = amplifyChoiceOptions(ampOpts, 1.6);
lines.push(`amplify.opt0 = ${amp[0].effect.coins},${amp[0].effect.xp}`);
lines.push(`amplify.opt1 = ${amp[1].outcomes[0].effects[0].amount},${amp[1].outcomes[0].effects[1].delta}`);
lines.push(`amplify.opt2 = ${amp[2].effect.amount}`);
lines.push(`amplify.opt3 = ${amp[3].effect.kind}`);
// ── 15. applyStatAndHealBuffs ──────────────────────────────────
const fmtHero = (h) => {
  const b = h.baseStats;
  return `${b.str},${b.int},${b.vit},${b.dex},${b.agi},${b.crit},${b.slotBonus},hp${h.hp},max${h.maxHp}`;
};
const buffStat = { effects: [{ kind: "stat", stats: { str: 5, vit: 3 } }], description: "" };
const buffHeal = { effects: [{ kind: "special", type: "healStart", value: 30 }], description: "" };
const buffAffinity = { effects: [{ kind: "affinity", category: "fitness", multiplier: 2 }, { kind: "stat", stats: { str: 10 } }], description: "" };
const buffCrit = { effects: [{ kind: "special", type: "critBonus", value: 8 }], description: "" };
lines.push(`applyStatAndHealBuffs(A) = ${fmtHero(applyStatAndHealBuffs(mkHero(), [buffStat, buffHeal], "fitness"))}`);
lines.push(`applyStatAndHealBuffs(B) = ${fmtHero(applyStatAndHealBuffs(mkHero(), [buffAffinity], "fitness"))}`);
lines.push(`applyStatAndHealBuffs(C) = ${fmtHero(applyStatAndHealBuffs(mkHero(), [buffAffinity], "nutrition"))}`);
lines.push(`applyStatAndHealBuffs(D) = ${fmtHero(applyStatAndHealBuffs(mkHero(), [buffCrit], "fitness"))}`);
// ── 16. applyClassStartEffects ─────────────────────────────────
for (const c of [null, "priest", "illusionist", "warrior"]) {
  lines.push(`applyClassStartEffects(${c}) = ${fmtHero(applyClassStartEffects(mkHero({ classType: c })))}`);
}

// ── 17. floorRewardScale (Phase 4-D) ───────────────────────────
for (const [fl, ng] of [[1, 0], [5, 0], [10, 0], [20, 0], [30, 0], [30, 1], [60, 2], [200, 0]]) {
  const r = floorRewardScale(fl, ng);
  lines.push(`floorRewardScale(${fl},ng${ng}) = ${r.coins},${r.xp}`);
}
// ── 18. scaleChoiceEffectsForFloor (Phase 4-D) ─────────────────
const fmtFx = (e) => {
  switch (e.kind) {
    case "reward": return `reward(${e.coins ?? "-"},${e.xp ?? "-"})`;
    case "damage": return `damage(${e.amount})`;
    case "heal": return `heal(${e.amount})`;
    case "time": return `time(${e.delta})`;
    case "runBuff": return `runBuff(${e.stat},${e.pct},${e.floors ?? "-"})`;
    case "runCurse": return `runCurse(${e.stat},${e.pct},${e.floors ?? "-"})`;
    case "stealth": return `stealth(${e.encounters})`;
    case "guaranteedDrop": return `guaranteedDrop(${e.count ?? "-"})`;
    default: return e.kind;
  }
};
const scaleFx = [
  { kind: "reward", coins: 35, xp: 10 },
  { kind: "damage", amount: 15 },
  { kind: "heal", amount: 20 },
  { kind: "time", delta: -3 },
  { kind: "spinSlot", cost: 30 },
  { kind: "runBuff", stat: "str", pct: 5, floors: 5 },
];
for (const [fl, hp, ng] of [[1, 100, 0], [10, 100, 0], [20, 388, 0], [30, 388, 1]]) {
  lines.push(
    `scaleChoiceEffectsForFloor(F${fl},hp${hp},ng${ng}) = ${scaleChoiceEffectsForFloor(scaleFx, fl, hp, ng).map(fmtFx).join("|")}`,
  );
}
// ── 19. summarizeEffectsData — 런 한정 효과 (Phase 4-D) ─────────
const runFx = [
  { kind: "runBuff", stat: "str", pct: 5, floors: 5 },
  { kind: "runCurse", stat: "agi", pct: 5, floors: 3 },
  { kind: "runCurse", stat: "all", pct: 10 },
  { kind: "stealth", encounters: 1 },
  { kind: "guaranteedDrop" },
  { kind: "revealBoss" },
  { kind: "skipFloors", count: 2 },
  { kind: "time", delta: -4 },
];
{
  const d = summarizeEffectsData(runFx);
  const rm = (d.runMods ?? []).map((m) => `${m.stat}${m.pct >= 0 ? "+" : ""}${m.pct}/${m.floors ?? "-"}`).join(",");
  lines.push(
    `summarizeEffectsData(runMods) = sk${d.skipFloors ?? "-"},rm[${rm}],st${d.stealth ?? "-"},gd${d.guaranteedDrop ?? "-"},bp${d.bossDmgPct ?? "-"},ti${d.timeDelta ?? "-"}`,
  );
  lines.push(`summarizeEffects(runMods) = [${summarizeEffects(runFx)}]`);
}
// ── 20. sessionStats — combatBuff 뒤 런 보정 2단 반올림 (Phase 4-D) ──
const statSession = {
  hero: mkHero({ baseStats: { str: 20, int: 13, vit: 17, dex: 9, agi: 10, crit: 7, slotBonus: 1 } }),
  combatBuff: { pct: 10, battlesLeft: 3 },
  runStatMods: [
    { stat: "str", pct: 5 },
    { stat: "all", pct: -50, floorsLeft: 2 },
    { stat: "agi", pct: 200 },
  ],
};
{
  const st = sessionStats(statSession);
  lines.push(`sessionStats(stack) = ${st.str},${st.int},${st.vit},${st.dex},${st.agi},${st.crit},${st.slotBonus}`);
  const st2 = sessionStats({ ...statSession, combatBuff: undefined });
  lines.push(`sessionStats(noBuff) = ${st2.str},${st2.int},${st2.vit},${st2.dex},${st2.agi},${st2.crit},${st2.slotBonus}`);
  const st3 = sessionStats({ ...statSession, runStatMods: undefined });
  lines.push(`sessionStats(noMods) = ${st3.str},${st3.int},${st3.vit},${st3.dex},${st3.agi},${st3.crit},${st3.slotBonus}`);
}

console.log(lines.join("\n"));
