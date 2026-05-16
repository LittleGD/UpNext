// datalayer-check.mjs — Phase 2.4 데이터 레이어 동치성 검증 (웹 측).
//
// 던전 데이터 + scaleMonster(결정론) + rollDropRarity/createEquipmentFromTemplate/
// rollEquipmentDrop (시드 가능 rng) 를 검증. createMonsterForFloor 는 Math.random
// (시드 불가) 라 제외 — scaleMonster 가 그 결정론 코어.
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/datalayer-check.mjs

import { DUNGEON_LIST } from "../src/data/upHeroDungeons.ts";
import { scaleMonster, ALL_MONSTER_TEMPLATES } from "../src/data/upHeroMonsters.ts";
import {
  rollDropRarity,
  createEquipmentFromTemplate,
  rollEquipmentDrop,
  EQUIPMENT_TEMPLATES,
} from "../src/data/upHeroEquipment.ts";
import { setRngSeed } from "../src/lib/upHeroRng.ts";

const lines = [];

// ── 1. 던전 데이터 ─────────────────────────────────────────────
for (const d of DUNGEON_LIST) {
  lines.push(`dungeon:${d.id} = ${d.name}|${d.themeColor}|${d.affinity}|${d.bossIds.join(",")}`);
}

// ── 2. scaleMonster (결정론) ───────────────────────────────────
const monT = (id) => ALL_MONSTER_TEMPLATES.find((t) => t.id === id);
const scaleCfgs = [
  ["fit_wolf", "fitness"],
  ["fit_bear", "fitness"],
  ["fit_goblin", "fitness"],
  ["boss_mountain_wolf", "fitness"],
  ["lrn_riddle", "learning"],
];
const optCfgs = [
  ["d", {}],
  ["ng2", { ngPlusLevel: 2 }],
  ["m", { hpMult: 1.2, atkMult: 0.8 }],
];
for (const [tid, dg] of scaleCfgs) {
  const t = monT(tid);
  for (const floor of [3, 10, 11, 30]) {
    for (const [on, opts] of optCfgs) {
      const m = scaleMonster(t, dg, floor, opts);
      lines.push(`scaleMonster:${tid}:f${floor}:${on} = hp${m.hp} atk${m.atk} def${m.def} xp${m.xpReward} coin${m.coinReward}`);
    }
  }
}

// ── 3. rollDropRarity (시드) ───────────────────────────────────
for (const floor of [5, 15, 25, 35]) {
  for (const [bn, bonus, flat] of [["b0", 0, false], ["b02", 0.02, false], ["flat", 0.05, true]]) {
    for (let seed = 1; seed <= 6; seed++) {
      setRngSeed(seed);
      lines.push(`rollDropRarity:f${floor}:${bn}:s${seed} = ${rollDropRarity(floor, bonus, flat)}`);
    }
  }
}

// ── 4. createEquipmentFromTemplate (시드, id 제외) ─────────────
const eqT = (baseId) => EQUIPMENT_TEMPLATES.find((t) => t.baseId === baseId);
function fmtEq(eq) {
  const stats = Object.keys(eq.stats).sort().map((k) => `${k}:${eq.stats[k]}`).join(",");
  const affixes = (eq.affixes ?? []).join("+");
  return `${eq.name}|${stats}|affix:${eq.affix ?? "-"}|affixes:${affixes || "-"}`;
}
for (const baseId of ["self_control_sword", "wisdom_glasses", "serenity_charm"]) {
  const t = eqT(baseId);
  for (const rarity of ["normal", "rare", "unique", "legend"]) {
    for (let seed = 1; seed <= 3; seed++) {
      setRngSeed(seed);
      lines.push(`createEquip:${baseId}:${rarity}:s${seed} = ${fmtEq(createEquipmentFromTemplate(t, rarity, 20))}`);
    }
  }
}

// ── 5. rollEquipmentDrop (시드, id 제외) ───────────────────────
for (const dg of ["fitness", "learning"]) {
  for (const rarity of ["rare", "legend"]) {
    for (let seed = 1; seed <= 4; seed++) {
      setRngSeed(seed);
      lines.push(`rollEquipDrop:${dg}:${rarity}:s${seed} = ${fmtEq(rollEquipmentDrop(dg, 15, rarity, "weapon"))}`);
    }
  }
}

console.log(lines.join("\n"));
