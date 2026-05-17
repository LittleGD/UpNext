// affix-narrative-check.mjs — Phase 2.4 weeklyAffixes + upHeroNarrative 검증 (웹).
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/affix-narrative-check.mjs

import {
  WEEKLY_AFFIX_POOL,
  pickWeeklyAffix,
  getWeeklyAffixById,
} from "../src/data/weeklyAffixes.ts";
import {
  heroAttackNarrativeI18n,
  monsterAttackNarrativeI18n,
} from "../src/lib/upHeroNarrative.ts";
import { setRngSeed } from "../src/lib/upHeroRng.ts";

const lines = [];

// ── 1. pickWeeklyAffix (해시 결정론) ───────────────────────────
for (const wk of ["2026-W16", "2026-W01", "2025-W52", "2024-W30", "2027-W09", "2026-W42"]) {
  lines.push(`pickWeeklyAffix:${wk} = ${pickWeeklyAffix(wk).id}`);
}
// ── 2. getWeeklyAffixById ──────────────────────────────────────
for (const id of ["glass_cannon", "iron_will", "nonexistent"]) {
  lines.push(`getWeeklyAffixById:${id} = ${getWeeklyAffixById(id)?.name ?? "nil"}`);
}
// ── 3. affix.apply (session mutate) ────────────────────────────
function mkSess() {
  return {
    hero: {
      hp: 200, maxHp: 200,
      baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
    },
    maxTime: 220, time: 220,
  };
}
function dumpSess(s) {
  const b = s.hero.baseStats;
  return `hp${s.hero.hp} max${s.hero.maxHp} str${b.str} agi${b.agi} crit${b.crit}`
    + ` | atkM${s.monsterAtkMult ?? "-"} hpM${s.monsterHpMult ?? "-"} critB${s.monsterCritBonus ?? "-"}`
    + ` | maxT${s.maxTime} t${s.time} | flat${s.flattenDropRarity ?? "-"} rest${s.restChanceBonus ?? "-"}`
    + ` | dodge${s.talismanMods?.dodgeBonus ?? "-"} buffs${(s.activeBuffs ?? []).length}`;
}
for (const affix of WEEKLY_AFFIX_POOL) {
  const s = mkSess();
  affix.apply(s);
  lines.push(`affixApply:${affix.id} = ${dumpSess(s)}`);
}

// ── 4. narrative (시드 rng) ────────────────────────────────────
const KINDS = ["beast", "goblin", "spirit", "construct", "book", "creature", "large"];
const OUTCOMES = ["hit", "crit", "dodge", "miss"];
function mkMon(kind) {
  return { id: "m", name: "몬스터", templateId: "tmpl_x", kind, level: 10, hp: 100, atk: 30, def: 10, xpReward: 10, coinReward: 5, dungeonId: "fitness" };
}
for (const kind of KINDS) {
  const m = mkMon(kind);
  for (const oc of OUTCOMES) {
    for (let seed = 1; seed <= 2; seed++) {
      setRngSeed(seed);
      const h = heroAttackNarrativeI18n(m, oc, 42);
      lines.push(`heroNarr:${kind}:${oc}:s${seed} = [${h.text}] key=${h.key}`);
      setRngSeed(seed);
      const e = monsterAttackNarrativeI18n(m, oc, 42);
      lines.push(`monsterNarr:${kind}:${oc}:s${seed} = [${e.text}] key=${e.key}`);
    }
  }
}

console.log(lines.join("\n"));
