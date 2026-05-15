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

console.log(lines.join("\n"));
