// talisman-reward-check.mjs — Phase 2.4 talismanSkills + sessionReward 동치성 검증 (웹).
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/talisman-reward-check.mjs

import {
  TALISMAN_SKILLS,
  computeTalismanSkillIds,
  collectTalismanMods,
  applyTalismanSkillStartEffects,
  emptyTalismanMods,
} from "../src/lib/talismanSkills.ts";
import {
  calculateKeptDrops,
  calculateBossesDefeated,
  calculateCodexDelta,
  calculateDungeonProgress,
  DUNGEON_CHECKPOINT_INTERVAL,
} from "../src/lib/sessionReward.ts";
import { getEquipmentBaseName } from "../src/data/upHeroEquipment.ts";

const lines = [];
const f10 = (x) => (x == null ? "-" : Number(x).toFixed(10));

const SKILL_IDS = [
  "fit_5", "fit_10", "lrn_5", "lrn_10", "mnd_5", "mnd_10", "ntr_5", "ntr_10",
  "soc_5", "soc_10", "prd_5", "prd_10", "wel_5", "wel_10", "trd_5", "trd_10",
];

function fmtMods(m) {
  return `dodge=${f10(m.dodgeBonus)} emiss=${f10(m.enemyMissBonus)} cdmg=${f10(m.critDmgBonus)} coin=${f10(m.coinMult)} time=${f10(m.timeCostMult)} heal=${f10(m.healEffectMult)} regen=${m.hpRegenEvery2Rounds} edrop=${f10(m.extraDropChance)} legend=${f10(m.legendDropBonus)} btime=${m.bossTimeRecover} counter=${f10(m.counterChance)} lowhp=${f10(m.lowHpDmgBonus)} agiacc=${m.agiRoundAccum} agicap=${m.agiRoundCap} cdred=${m.classSkillCdReduce} sxp=${m.startXp} shpm=${f10(m.startHpMult)} shpf=${m.startHpFlat}`;
}

// ── A. 부적 스킬 16종 apply ─────────────────────────────────────
for (const id of SKILL_IDS) {
  const m = emptyTalismanMods();
  TALISMAN_SKILLS[id].apply(m);
  lines.push(`talismanApply:${id} = ${fmtMods(m)}`);
}

// ── B. computeTalismanSkillIds ─────────────────────────────────
const CATS = ["fitness", "learning", "mindfulness", "nutrition", "social", "productivity", "wellness", "trending"];
for (const cat of CATS) {
  for (const lvl of [0, 4, 5, 9, 10]) {
    lines.push(`computeTalismanSkillIds:${cat}:${lvl} = [${computeTalismanSkillIds(cat, lvl).join(",")}]`);
  }
}

// ── C. collectTalismanMods ─────────────────────────────────────
function mkEquip(o) {
  return {
    id: o.id, name: o.name ?? o.id, type: o.type ?? "weapon", rarity: o.rarity ?? "normal",
    category: o.category ?? "fitness", iconName: "x", stats: {}, talismanSkills: o.talismanSkills,
  };
}
{
  const hero = {
    name: "H", hp: 100, maxHp: 100,
    baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
    equipped: {
      talisman: mkEquip({ id: "t", type: "talisman", talismanSkills: ["fit_5", "fit_10"] }),
      weapon: mkEquip({ id: "w", type: "weapon", talismanSkills: ["soc_5", "wel_5"] }),
      armor: mkEquip({ id: "a", type: "armor" }),
    },
    classType: null, appearanceVariant: 0,
  };
  lines.push(`collectTalismanMods = ${fmtMods(collectTalismanMods(hero))}`);
}

// ── D. applyTalismanSkillStartEffects ──────────────────────────
{
  const session = {
    hero: { name: "H", hp: 200, maxHp: 200, baseStats: {}, equipped: {}, classType: null, appearanceVariant: 0 },
    rewards: { xp: 0, coins: 0, drops: [] },
  };
  const m = emptyTalismanMods();
  m.startHpMult = 1.1;
  m.startHpFlat = 20;
  m.startXp = 15;
  applyTalismanSkillStartEffects(session, m);
  lines.push(`applyTalismanStart = hp${session.hero.hp} max${session.hero.maxHp} xp${session.rewards.xp}`);
}

// ── E. equipmentBaseName ───────────────────────────────────────
for (const [name, rarity] of [
  ["검", "normal"], ["빛나는 검", "rare"], ["전설적 갑옷", "unique"],
  ["신성한 부적", "legend"], ["빛나는검", "rare"],
]) {
  lines.push(`equipBaseName:${name}:${rarity} = ${getEquipmentBaseName({ name, rarity })}`);
}

// ── 세션 보상 픽스처 ───────────────────────────────────────────
function mkEq(id) {
  return { id, name: id, type: "weapon", rarity: "normal", category: "fitness", iconName: "x", stats: {} };
}
function mkSess(o) {
  return {
    dungeonId: "fitness", startFloor: 1, currentFloor: o.currentFloor ?? 10,
    log: o.log ?? [], hero: {}, rewards: { xp: 0, coins: 0, drops: o.drops ?? [] },
    status: "completed", speed: 1, time: 0, maxTime: 220, startedAt: 0,
  };
}
const endE = (reason) => ({ type: "sessionEnd", reason, timestamp: 0 });

// ── F. calculateKeptDrops (결정론 분기만) ──────────────────────
{
  const s1 = mkSess({ drops: [mkEq("A"), mkEq("B"), mkEq("C")], log: [endE("bossDefeated")] });
  lines.push(`keptDrops:notDied = ${calculateKeptDrops(s1).map((d) => d.id).join(",")}`);
  const s2 = mkSess({ drops: [mkEq("A"), mkEq("B"), mkEq("C"), mkEq("D")], log: [endE("heroDied")] });
  lines.push(`keptDrops:died4 = ${calculateKeptDrops(s2).map((d) => d.id).join(",")}`);
  const s3 = mkSess({ drops: [mkEq("A"), mkEq("B"), mkEq("C"), mkEq("D"), mkEq("E")], log: [endE("defeat")] });
  lines.push(`keptDrops:defeat5 = ${calculateKeptDrops(s3).map((d) => d.id).join(",")}`);
}

// ── G. calculateBossesDefeated ─────────────────────────────────
{
  const bossE = (floor) => ({ type: "boss", monster: { name: "B", isBoss: true }, floor, timestamp: 0 });
  const vicBoss = () => ({ type: "victory", monster: { name: "B", isBoss: true }, xp: 0, coins: 0, timestamp: 0 });
  const vicNorm = () => ({ type: "victory", monster: { name: "m", isBoss: false }, xp: 0, coins: 0, timestamp: 0 });
  const log = [bossE(10), vicBoss(), bossE(20), vicNorm(), bossE(30), vicBoss()];
  lines.push(`bossesDefeated:A = [${calculateBossesDefeated(log, [5]).join(",")}]`);
  lines.push(`bossesDefeated:B = [${calculateBossesDefeated(log, [20]).join(",")}]`);
}

// ── H. calculateCodexDelta ─────────────────────────────────────
{
  const encE = (name, isBoss) => ({ type: "encounter", monster: { name, isBoss }, timestamp: 0 });
  const dropE = (name, rarity) => ({ type: "drop", equipment: { name, rarity }, timestamp: 0 });
  const log = [encE("고블린", false), encE("드래곤", true), encE("고블린", false), dropE("빛나는 검", "rare"), dropE("검", "normal")];
  const cx = calculateCodexDelta(log, { monsters: ["슬라임"], bosses: [], equipment: ["방패"] });
  lines.push(`codexDelta = m[${cx.monsters.join("|")}] b[${cx.bosses.join("|")}] e[${cx.equipment.join("|")}]`);
}

// ── I. calculateDungeonProgress ────────────────────────────────
{
  const s = mkSess({ currentFloor: 45, log: [endE("heroDied")] });
  const p = calculateDungeonProgress(s, { dungeonId: "fitness", floorReached: 20, bestFloorReached: 40, bossesDefeated: [10] }, [10, 20]);
  lines.push(`dungeonProgress:died = f${p.floorReached} best${p.bestFloorReached} boss[${p.bossesDefeated.join(",")}]`);
  const s2 = mkSess({ currentFloor: 33, log: [endE("bossDefeated")] });
  const p2 = calculateDungeonProgress(s2, undefined, [30]);
  lines.push(`dungeonProgress:cleared = f${p2.floorReached} best${p2.bestFloorReached} boss[${p2.bossesDefeated.join(",")}]`);
}
lines.push(`checkpointInterval = ${DUNGEON_CHECKPOINT_INTERVAL}`);

console.log(lines.join("\n"));
