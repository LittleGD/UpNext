// classskills-check.mjs — Phase 2.4 "스킬" 동치성 검증 (웹 측)
//
// src/lib/classSkills.ts 의 35개 스킬(apply/shouldFire) + 발동 로직을 고정 입력으로
// 실행. 스킬은 RNG 미사용 — 전부 결정론적. Swift 측이 같은 출력을 내면 동치.
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/classskills-check.mjs

import {
  CLASS_SKILL_TREES,
  NOVICE_SKILLS,
  findSkillById,
  canFireSkill,
  fireSkill,
  maybeFireSkill,
  advanceSkillCounters,
} from "../src/lib/classSkills.ts";

const lines = [];
const dash = (x) => (x == null ? "-" : String(x));
const f10 = (x) => (x == null ? "-" : Number(x).toFixed(10));

const CLASS_ORDER = ["warrior", "mage", "monk", "druid", "bard", "chronomancer", "priest", "illusionist"];
const allSkills = [...NOVICE_SKILLS];
for (const c of CLASS_ORDER) allSkills.push(...CLASS_SKILL_TREES[c]);

function mkSession(o = {}) {
  return {
    dungeonId: "fitness", startFloor: 1, currentFloor: 1, log: [],
    hero: {
      name: "H", hp: o.hp ?? 470, maxHp: o.maxHp ?? 500,
      baseStats: { str: 10, int: o.int ?? 50, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
      equipped: {}, classType: o.classType ?? null, appearanceVariant: 0,
      autoSkillEnabled: o.autoSkillEnabled, learnedSkills: o.learnedSkills, skillPoints: o.skillPoints,
    },
    rewards: { xp: 0, coins: 0, drops: [] }, status: "active", speed: 1,
    time: o.time ?? 215, maxTime: o.maxTime ?? 220,
    classResource: o.classResource ?? 100,
    skillCooldown: o.skillCooldown,
    skillCooldowns: o.skillCooldowns,
    heroAtkBonusRounds: o.heroAtkBonusRounds,
    enemyStunnedRounds: o.enemyStunnedRounds,
    heroDmgReductionRounds: o.heroDmgReductionRounds,
    guaranteedCritAttacks: o.guaranteedCritAttacks,
    heroInvulnerableRounds: o.heroInvulnerableRounds,
    revivePending: o.revivePending,
    nextHeroDamageMult: o.nextHeroDamageMult,
    forcedDodgeRounds: o.forcedDodgeRounds,
    forcedEnemyMisses: o.forcedEnemyMisses,
    nextCoinMult: o.nextCoinMult,
    startedAt: 0,
  };
}
function mkMonster(o = {}) {
  return {
    id: "m", name: "M", templateId: "tmpl", kind: "beast", level: o.level ?? 20,
    hp: o.hp ?? 400, atk: 30, def: 10, xpReward: 10, coinReward: 5,
    isBoss: o.isBoss ?? false, dungeonId: "fitness",
  };
}
function effSummary(s) {
  const atk = s.heroAtkBonusRounds
    ? `${s.heroAtkBonusRounds.rounds}/${f10(s.heroAtkBonusRounds.mult)}` : "-";
  const dr = s.heroDmgReductionRounds
    ? `${s.heroDmgReductionRounds.rounds}/${f10(s.heroDmgReductionRounds.reduction)}` : "-";
  const cd = s.skillCooldowns
    ? Object.keys(s.skillCooldowns).sort().map((k) => `${k}:${s.skillCooldowns[k]}`).join(";")
    : "-";
  return `ndm=${f10(s.nextHeroDamageMult)} atk=${atk} stun=${dash(s.enemyStunnedRounds)} dr=${dr} inv=${dash(s.heroInvulnerableRounds)} fd=${dash(s.forcedDodgeRounds)} fem=${dash(s.forcedEnemyMisses)} ncm=${f10(s.nextCoinMult)} gca=${dash(s.guaranteedCritAttacks)} rev=${dash(s.revivePending)} cd=${cd}`;
}

// ── A. apply — 35 스킬 고정 preset 직접 호출 ────────────────────
const applyMonster = mkMonster({ hp: 400, level: 20, isBoss: false });
for (const sk of allSkills) {
  const s = mkSession({ skillCooldowns: { warrior_smash_t1: 3, mage_lightning_t1: 5 } });
  const prev = s.log.length;
  sk.apply(s, applyMonster);
  const ne = s.log.slice(prev);
  const ce = ne.find((e) => e.type === "combat");
  const se = ne.find((e) => e.type === "skill");
  lines.push(
    `apply:${sk.id} = hp${s.hero.hp} t${s.time} combat${ce ? ce.damage : "-"} | ${effSummary(s)} | ${se ? se.narrative : "-"} | ${se ? dash(se.skillId) : "-"}`,
  );
}

// ── B. shouldFire — 35 스킬 × 3 세션 변형 ──────────────────────
const sfMon = mkMonster({ hp: 400, level: 20, isBoss: false });
const sfMonMid = mkMonster({ hp: 100, level: 5, isBoss: false });
const variants = [
  ["full", () => mkSession({ hp: 206, maxHp: 207, time: 219, maxTime: 220, skillCooldowns: { warrior_smash_t1: 2 } }), sfMon],
  ["low", () => mkSession({ hp: 10, maxHp: 207, time: 10, maxTime: 220 }), sfMon],
  ["mid", () => mkSession({ hp: 103, maxHp: 207, time: 110, maxTime: 220, heroAtkBonusRounds: { rounds: 3, mult: 1.3 }, enemyStunnedRounds: 1, guaranteedCritAttacks: 3, revivePending: true }), sfMonMid],
];
for (const sk of allSkills) {
  for (const [vn, vf, vm] of variants) {
    lines.push(`shouldFire:${sk.id}:${vn} = ${sk.shouldFire(vf(), vm)}`);
  }
}

// ── C. findSkillById ───────────────────────────────────────────
for (const id of ["warrior_smash_t1", "mage_meteor_t4", "novice_brace", "nonexistent"]) {
  const sk = findSkillById(id);
  lines.push(`findSkillById:${id} = ${sk ? sk.name : "nil"}`);
}

// ── D. canFireSkill ────────────────────────────────────────────
{
  const s = mkSession({
    classResource: 50,
    learnedSkills: ["warrior_smash_t1", "warrior_berserk_t2", "warrior_crush_t3"],
    skillCooldowns: { warrior_berserk_t2: 3 },
  });
  for (const id of ["warrior_smash_t1", "warrior_berserk_t2", "warrior_crush_t3", "novice_heal"]) {
    const r = canFireSkill(s, id);
    lines.push(`canFireSkill:${id} = ${r.ok},${r.reason ?? "-"}`);
  }
}

// ── E. fireSkill ───────────────────────────────────────────────
{
  const s = mkSession({ classResource: 80, learnedSkills: ["warrior_smash_t1"] });
  const ok = fireSkill(s, "warrior_smash_t1", applyMonster);
  lines.push(
    `fireSkill = ${ok} res${s.classResource} cd${(s.skillCooldowns ?? {}).warrior_smash_t1} t1cd${dash(s.skillCooldown)} ndm${f10(s.nextHeroDamageMult)}`,
  );
}

// ── F. maybeFireSkill ──────────────────────────────────────────
{
  const s = mkSession({ classResource: 100, classType: "warrior", autoSkillEnabled: true, learnedSkills: ["warrior_smash_t1", "warrior_rage_burst_t4"] });
  maybeFireSkill(s, applyMonster);
  const last = [...s.log].reverse().find((e) => e.type === "skill");
  lines.push(`maybeFireSkill:hiTier = ${last ? last.skillId : "none"}`);
}
{
  const s = mkSession({ classResource: 100, classType: "warrior", autoSkillEnabled: false, learnedSkills: ["warrior_smash_t1"] });
  maybeFireSkill(s, applyMonster);
  lines.push(`maybeFireSkill:autoOff = log${s.log.length}`);
}
{
  const s = mkSession({ classResource: 0, autoSkillEnabled: true, learnedSkills: ["novice_heal"], hp: 100, maxHp: 500 });
  maybeFireSkill(s, applyMonster);
  const last = [...s.log].reverse().find((e) => e.type === "skill");
  lines.push(`maybeFireSkill:novice = ${last ? last.skillId : "none"}`);
}

// ── G. advanceSkillCounters ────────────────────────────────────
{
  const s = mkSession({
    skillCooldowns: { a: 3, b: 1, c: 0 }, skillCooldown: 2,
    forcedDodgeRounds: 1, heroAtkBonusRounds: { rounds: 1, mult: 1.3 },
    enemyStunnedRounds: 2, heroDmgReductionRounds: { rounds: 1, reduction: 0.3 },
    heroInvulnerableRounds: 3,
  });
  advanceSkillCounters(s);
  lines.push(`advanceSkillCounters = ${effSummary(s)} t1cd${dash(s.skillCooldown)}`);
}

console.log(lines.join("\n"));
