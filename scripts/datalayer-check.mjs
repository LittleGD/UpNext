// datalayer-check.mjs — Phase 2.4 데이터 레이어 동치성 검증 (웹 측).
//
// 던전 데이터 + scaleMonster(결정론) + rollDropRarity/createEquipmentFromTemplate/
// rollEquipmentDrop (시드 가능 rng) 를 검증. Phase 16 (Track C) 부터
// createMonsterForFloor 도 rng() (시드 가능) 라 섹션 6 에서 템플릿 선택을 대조한다
// (호출 순서: newbie roll → power 티어 roll → 티어 내 인덱스 roll).
// Phase 6-E (Track E) — 7 sellPrice / 8 synthesizeEquipment / 9 equipmentBaseName /
// 10 bossSprites (Swift 쪽은 Models/BossSprites.swift, Foundation 만).
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/datalayer-check.mjs

import { DUNGEON_LIST } from "../src/data/upHeroDungeons.ts";
import {
  scaleMonster,
  createMonsterForFloor,
  ALL_MONSTER_TEMPLATES,
} from "../src/data/upHeroMonsters.ts";
import {
  rollDropRarity,
  createEquipmentFromTemplate,
  rollEquipmentDrop,
  synthesizeEquipment,
  getEquipmentBaseName,
  EQUIPMENT_TEMPLATES,
} from "../src/data/upHeroEquipment.ts";
import { sellPrice } from "../src/types/uphero.ts";
import { BOSS_FRAMES } from "../src/components/uphero/bossSprites.ts";
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

// ── 6. createMonsterForFloor (시드, 템플릿 선택 + 보스 사이클 인덱스) ──
for (const dg of ["fitness", "learning"]) {
  for (const floor of [3, 8, 15, 25, 45]) {
    for (let seed = 1; seed <= 3; seed++) {
      setRngSeed(seed);
      const m = createMonsterForFloor(dg, floor, false);
      lines.push(`createMonster:${dg}:f${floor}:s${seed} = ${m.templateId} hp${m.hp} atk${m.atk} def${m.def}`);
    }
  }
  for (const floor of [10, 20, 30, 40, 50, 60]) {
    const b = createMonsterForFloor(dg, floor, true);
    lines.push(`createBoss:${dg}:f${floor} = ${b.templateId} hp${b.hp} atk${b.atk} def${b.def} xp${b.xpReward} coin${b.coinReward}`);
  }
}

// ── 7. sellPrice (Phase 6-E, Track E — 정수 표 산술) ────────────
for (const [rarity, floor, level] of [
  ["normal", 0, 0], ["normal", 30, 0], ["rare", 12, 3],
  ["unique", 20, 10], ["legend", 30, 10], ["legend", 120, 25],
]) {
  lines.push(`sellPrice:${rarity}:f${floor}:l${level} = ${sellPrice(rarity, floor, level)}`);
}

// ── 8. synthesizeEquipment (시드, id 제외) ─────────────────────
//   rng 호출 순서: 풀 인덱스 1회 → createEquipmentFromTemplate 내부.
function synthSources(rarity) {
  const mk = (id, category, dropFloor) => ({
    id, name: "x", type: "weapon", rarity, category, iconName: "Sword", stats: { str: 5 }, dropFloor,
  });
  return [mk("a", "fitness", 12), mk("b", "learning", 20), mk("c", "learning", 15)];
}
for (const rarity of ["normal", "rare", "unique"]) {
  for (let seed = 1; seed <= 4; seed++) {
    setRngSeed(seed);
    const out = synthesizeEquipment(synthSources(rarity));
    lines.push(`synth:${rarity}:s${seed} = ${out.baseId}|${out.rarity}|f${out.dropFloor}|${fmtEq(out)}`);
  }
}
setRngSeed(1);
lines.push(`synth:legend:s1 = ${synthesizeEquipment(synthSources("legend")) === null ? "null" : "?"}`);

// ── 9. equipmentBaseName ───────────────────────────────────────
for (const [i, eq] of [
  { baseId: "self_control_sword", name: "신성한 자기절제의 검 of 민첩, 힘 +7", rarity: "legend" },
  { name: "신성한 자기절제의 검 of 민첩, 힘 +7", rarity: "legend" },
  { name: "빛나는 곡물의 갑옷 of 힘", rarity: "rare" },
  { name: "꾸준함의 방패 +3", rarity: "normal" },
  { name: "메모의 펜", rarity: "normal" },
  { baseId: "nope", name: "빛나는 지혜의 안경 of 힘", rarity: "rare" },
].entries()) {
  lines.push(`baseName:${i} = ${getEquipmentBaseName(eq)}`);
}

// ── 10. bossSprites (24 × 2 프레임 12×12) ──────────────────────
for (const id of Object.keys(BOSS_FRAMES).sort()) {
  const [f1, f2] = BOSS_FRAMES[id];
  lines.push(`boss:${id} = ${f1.join("|")}/${f2.join("|")}`);
}

console.log(lines.join("\n"));
