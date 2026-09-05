import { describe, it, expect } from "vitest";

/**
 * Phase 3-F (피드백 34b) — 직업별 스킬 분기 트리.
 *
 *   - 트리 형태: class 마다 [T1, T2a, T2b, T3a, T3b, T4] 6개, 전체 51개(novice 3 포함) 고유 id.
 *   - requires 배선: T2 → [T1], T3 → [T2a, T2b], T4 → [T3a, T3b].
 *   - getSkillLearnStatus 검사 순서: learned → class → level → requires → branch → points.
 *   - pushSkillLog 규약: 모든 스킬의 skill 로그 narrativeKey = `uphero.skill.<id>.narrative`
 *     이고 ko 사전에 name/desc/narrative 가 있다.
 *   - maybeFireSkill: tier 내림차순, 동 tier 는 선언 순서 (a 먼저) 타이브레이크.
 *   - 신규 b 스킬 16개의 shouldFire / apply 효과.
 */
import {
  CLASS_SKILL_TREES,
  NOVICE_SKILLS,
  findSkillById,
  getSiblingSkill,
  getSkillLearnStatus,
  maybeFireSkill,
  SKILL_TREE_TIERS,
  type ClassSkill,
} from "./classSkills";
import ko from "@/i18n/ko";
import type { ClassType, CombatSession, Monster } from "@/types/uphero";
import { setRngSeed, resetRng } from "./upHeroRng";

const CLASSES: ClassType[] = [
  "warrior",
  "mage",
  "monk",
  "druid",
  "bard",
  "chronomancer",
  "priest",
  "illusionist",
];

const koDict = ko as Record<string, string>;

function mkSession(o: {
  hp?: number;
  maxHp?: number;
  int?: number;
  classType?: ClassType | null;
  learnedSkills?: string[];
  autoSkillEnabled?: boolean;
  classResource?: number;
  skillCooldowns?: Record<string, number>;
  time?: number;
  maxTime?: number;
} = {}): CombatSession {
  return {
    dungeonId: "fitness",
    startFloor: 1,
    currentFloor: 1,
    log: [],
    hero: {
      name: "H",
      hp: o.hp ?? 470,
      maxHp: o.maxHp ?? 500,
      baseStats: {
        str: 10,
        int: o.int ?? 50,
        vit: 10,
        dex: 10,
        agi: 10,
        crit: 0,
        slotBonus: 0,
      },
      equipped: {},
      classType: o.classType ?? null,
      appearanceVariant: 0,
      autoSkillEnabled: o.autoSkillEnabled,
      learnedSkills: o.learnedSkills,
    },
    rewards: { xp: 0, coins: 0, drops: [] },
    status: "active",
    speed: 1,
    time: o.time ?? 215,
    maxTime: o.maxTime ?? 220,
    classResource: o.classResource ?? 100,
    skillCooldowns: o.skillCooldowns,
    startedAt: 0,
  } as CombatSession;
}

function mkMonster(o: { hp?: number; isBoss?: boolean } = {}): Monster {
  return {
    id: "m",
    name: "M",
    templateId: "tmpl",
    kind: "beast",
    level: 20,
    hp: o.hp ?? 400,
    atk: 30,
    def: 10,
    xpReward: 10,
    coinReward: 5,
    isBoss: o.isBoss ?? false,
    dungeonId: "fitness",
  } as Monster;
}

const tree = (cls: ClassType) => CLASS_SKILL_TREES[cls];
const byTier = (cls: ClassType, tier: number, branch?: "a" | "b") =>
  tree(cls).find((s) => s.tier === tier && (branch ? s.branch === branch : true))!;
const lastSkillId = (s: CombatSession) => {
  const e = [...s.log].reverse().find((x) => x.type === "skill");
  return e && e.type === "skill" ? (e.skillId ?? null) : null;
};
/** skill 로그 entry 의 narrativeParams (union 좁히기용). */
const skillParams = (s: CombatSession) => {
  const e = s.log.find((x) => x.type === "skill");
  return e && e.type === "skill" ? e.narrativeParams : undefined;
};

// ────────────────────────────────────────────
describe("트리 형태", () => {
  it("class 마다 [T1, T2a, T2b, T3a, T3b, T4] 순서", () => {
    for (const cls of CLASSES) {
      expect(tree(cls).map((s) => [s.tier, s.branch])).toEqual([
        [1, undefined],
        [2, "a"],
        [2, "b"],
        [3, "a"],
        [3, "b"],
        [4, undefined],
      ]);
      expect(SKILL_TREE_TIERS).toEqual([1, 2, 3, 4]);
    }
  });

  it("전체 51개 id 고유 + id 네이밍 규약", () => {
    const all = [...NOVICE_SKILLS, ...CLASSES.flatMap((c) => tree(c))];
    expect(all).toHaveLength(51);
    expect(new Set(all.map((s) => s.id)).size).toBe(51);
    const RE = /^(warrior|mage|monk|druid|bard|chrono|priest|illus)_[a-z_]+_t[1-4]$/;
    for (const cls of CLASSES) {
      for (const s of tree(cls)) {
        expect(s.id).toMatch(RE);
        expect(s.class).toBe(cls);
      }
    }
  });

  it("requires 배선: T2=[T1], T3=[T2a,T2b], T4=[T3a,T3b]; T1 없음", () => {
    for (const cls of CLASSES) {
      const t1 = byTier(cls, 1);
      const t2a = byTier(cls, 2, "a");
      const t2b = byTier(cls, 2, "b");
      const t3a = byTier(cls, 3, "a");
      const t3b = byTier(cls, 3, "b");
      const t4 = byTier(cls, 4);
      expect(t1.requires).toBeUndefined();
      expect(t2a.requires).toEqual([t1.id]);
      expect(t2b.requires).toEqual([t1.id]);
      expect(t3a.requires).toEqual([t2a.id, t2b.id]);
      expect(t3b.requires).toEqual([t2a.id, t2b.id]);
      expect(t4.requires).toEqual([t3a.id, t3b.id]);
    }
  });

  it("T2 는 Lv35/1SP, T3 는 Lv40/1SP, T4 는 Lv45/2SP", () => {
    for (const cls of CLASSES) {
      for (const s of tree(cls)) {
        if (s.tier === 2) {
          expect([s.requiredLevel, s.pointCost]).toEqual([35, 1]);
        } else if (s.tier === 3) {
          expect([s.requiredLevel, s.pointCost]).toEqual([40, 1]);
        } else if (s.tier === 4) {
          expect([s.requiredLevel, s.pointCost]).toEqual([45, 2]);
        }
      }
    }
  });

  it("getSiblingSkill — T2/T3 는 형제, T1/T4/novice 는 null", () => {
    for (const cls of CLASSES) {
      expect(getSiblingSkill(byTier(cls, 2, "a"))?.id).toBe(byTier(cls, 2, "b").id);
      expect(getSiblingSkill(byTier(cls, 2, "b"))?.id).toBe(byTier(cls, 2, "a").id);
      expect(getSiblingSkill(byTier(cls, 3, "a"))?.id).toBe(byTier(cls, 3, "b").id);
      expect(getSiblingSkill(byTier(cls, 1))).toBeNull();
      expect(getSiblingSkill(byTier(cls, 4))).toBeNull();
    }
    expect(getSiblingSkill(NOVICE_SKILLS[0])).toBeNull();
    expect(findSkillById("warrior_ironwall_t2")?.branch).toBe("b");
  });
});

// ────────────────────────────────────────────
describe("getSkillLearnStatus (warrior)", () => {
  const T1 = "warrior_smash_t1";
  const T2A = "warrior_berserk_t2";
  const T2B = "warrior_ironwall_t2";
  const T3A = "warrior_crush_t3";
  const T3B = "warrior_warcry_t3";
  const T4 = "warrior_rage_burst_t4";
  const sk = (id: string) => findSkillById(id)!;
  const ctx = (learned: string[], o: Partial<{ heroLevel: number; points: number; classType: ClassType | null }> = {}) => ({
    classType: (o.classType === undefined ? "warrior" : o.classType) as ClassType | null,
    heroLevel: o.heroLevel ?? 45,
    learned,
    points: o.points ?? 5,
  });

  it("매트릭스", () => {
    expect(getSkillLearnStatus(sk(T2B), ctx([T1, T2A]))).toBe("branch");
    expect(getSkillLearnStatus(sk(T4), ctx([T1, T2A]))).toBe("requires");
    expect(getSkillLearnStatus(sk(T4), ctx([T1, T2B, T3B]))).toBe("ok");
    expect(getSkillLearnStatus(sk(T3B), ctx([T1, T2A]))).toBe("ok");
    expect(getSkillLearnStatus(sk(T3B), ctx([T1]))).toBe("requires");
    expect(getSkillLearnStatus(sk(T3A), ctx([T1, T2B, T3B]))).toBe("branch");
    expect(getSkillLearnStatus(sk("mage_freeze_t2"), ctx([T1]))).toBe("class");
    expect(getSkillLearnStatus(sk(T2A), ctx([T1], { classType: null }))).toBe("class");
    expect(getSkillLearnStatus(sk(T2A), ctx([T1], { heroLevel: 34 }))).toBe("level");
    expect(getSkillLearnStatus(sk(T2A), ctx([T1], { points: 0 }))).toBe("points");
    expect(getSkillLearnStatus(sk(T2A), ctx([T1, T2A]))).toBe("learned");
    expect(getSkillLearnStatus(sk(T2A), ctx([T1]))).toBe("ok");
    expect(getSkillLearnStatus(sk(T1), ctx([]))).toBe("ok");
  });

  it("검사 순서: learned > class > level > requires > branch > points", () => {
    // learned 가 모든 것에 우선 (class/level/points 전부 실패해도 learned).
    expect(
      getSkillLearnStatus(sk(T2A), ctx([T2A], { classType: "mage", heroLevel: 1, points: 0 })),
    ).toBe("learned");
    // class 가 level 보다 우선.
    expect(getSkillLearnStatus(sk(T2A), ctx([T1], { classType: "mage", heroLevel: 1 }))).toBe("class");
    // level 이 requires 보다 우선.
    expect(getSkillLearnStatus(sk(T3B), ctx([T1], { heroLevel: 39 }))).toBe("level");
    // requires 가 branch 보다 우선 (형제를 배웠어도 선행이 없으면 requires).
    expect(getSkillLearnStatus(sk(T3B), ctx([T1, T3A]))).toBe("requires");
    // branch 가 points 보다 우선.
    expect(getSkillLearnStatus(sk(T2B), ctx([T1, T2A], { points: 0 }))).toBe("branch");
    // requires 가 points 보다 우선.
    expect(getSkillLearnStatus(sk(T4), ctx([T1, T2A], { points: 0 }))).toBe("requires");
  });

  it("레거시 [T1,T2a,T2b] 저장본은 revoke 하지 않고 learned 로 본다", () => {
    expect(getSkillLearnStatus(sk(T2B), ctx([T1, T2A, T2B]))).toBe("learned");
    expect(getSkillLearnStatus(sk(T3A), ctx([T1, T2A, T2B]))).toBe("ok");
  });
});

// ────────────────────────────────────────────
describe("pushSkillLog 규약 + ko 사전", () => {
  const all: ClassSkill[] = [...NOVICE_SKILLS, ...CLASSES.flatMap((c) => tree(c))];

  it("모든 스킬 apply 는 narrativeKey = uphero.skill.<id>.narrative 인 skill 로그를 남긴다", () => {
    for (const skill of all) {
      const s = mkSession({ hp: 100, maxHp: 500, skillCooldowns: { warrior_smash_t1: 3 } });
      skill.apply(s, mkMonster());
      const entry = s.log.find((e) => e.type === "skill");
      expect(entry, skill.id).toBeDefined();
      expect(entry!.narrativeKey).toBe(`uphero.skill.${skill.id}.narrative`);
      expect(entry!.skillId).toBe(skill.id);
      expect(koDict[`uphero.skill.${skill.id}.name`], `${skill.id}.name`).toBeTruthy();
      expect(koDict[`uphero.skill.${skill.id}.desc`], `${skill.id}.desc`).toBeTruthy();
      expect(koDict[`uphero.skill.${skill.id}.narrative`], `${skill.id}.narrative`).toBeTruthy();
      for (const c of s.log.filter((e) => e.type === "combat")) {
        expect(c.narrativeKey, `${skill.id} combat key`).toBe(
          `uphero.combat.narrative.skillHitMonster.${skill.id}`,
        );
        expect(koDict[c.narrativeKey!], c.narrativeKey).toBeTruthy();
      }
    }
  });

  it("신규 b 스킬 카피에 em-dash 없음 (코드 narrative + ko/i18n)", () => {
    const newIds = CLASSES.flatMap((c) => tree(c).filter((s) => s.branch === "b").map((s) => s.id));
    expect(newIds).toHaveLength(16);
    for (const id of newIds) {
      const s = mkSession({ hp: 100, maxHp: 500 });
      findSkillById(id)!.apply(s, mkMonster());
      for (const e of s.log) {
        if ("narrative" in e) expect(e.narrative, id).not.toContain("—");
      }
      for (const suffix of ["name", "desc", "narrative"]) {
        expect(koDict[`uphero.skill.${id}.${suffix}`]).not.toContain("—");
      }
    }
    expect(koDict["uphero.combat.narrative.skillHitMonster.mage_chain_t3"]).not.toContain("—");
    expect(koDict["uphero.combat.narrative.skillHitMonster.illus_burst_t3"]).not.toContain("—");
  });
});

// ────────────────────────────────────────────
describe("maybeFireSkill 선택 + 타이브레이크", () => {
  const base = (o: Parameters<typeof mkSession>[0]) => {
    setRngSeed(7);
    try {
      return mkSession({
        classType: "warrior",
        autoSkillEnabled: true,
        classResource: 100,
        ...o,
      });
    } finally {
      resetRng();
    }
  };

  it("[T1,T2b,T3b] hp 40% → T3b(전쟁의 함성) 우선", () => {
    const s = base({ learnedSkills: ["warrior_smash_t1", "warrior_ironwall_t2", "warrior_warcry_t3"], hp: 200, maxHp: 500 });
    maybeFireSkill(s, mkMonster());
    expect(lastSkillId(s)).toBe("warrior_warcry_t3");
  });

  it("같은 상황에서 T3b 쿨다운 3 → T2b(철벽) 발동", () => {
    const s = base({
      learnedSkills: ["warrior_smash_t1", "warrior_ironwall_t2", "warrior_warcry_t3"],
      hp: 200,
      maxHp: 500,
      skillCooldowns: { warrior_warcry_t3: 3 },
    });
    maybeFireSkill(s, mkMonster());
    expect(lastSkillId(s)).toBe("warrior_ironwall_t2");
    expect(s.heroDmgReductionRounds).toEqual({ rounds: 3, reduction: 0.4 });
  });

  it("레거시 [T1,T2a,T2b] 둘 다 준비 + hp 50% → 선언 순서 a(광폭화) 우선", () => {
    const s = base({ learnedSkills: ["warrior_smash_t1", "warrior_berserk_t2", "warrior_ironwall_t2"], hp: 250, maxHp: 500 });
    maybeFireSkill(s, mkMonster());
    expect(lastSkillId(s)).toBe("warrior_berserk_t2");
  });

  it("역순 learnedSkills 라도 트리 선언 순서가 이긴다 (안정 정렬 계약)", () => {
    const s = base({ learnedSkills: ["warrior_ironwall_t2", "warrior_berserk_t2", "warrior_smash_t1"], hp: 250, maxHp: 500 });
    maybeFireSkill(s, mkMonster());
    expect(lastSkillId(s)).toBe("warrior_berserk_t2");
  });

  it("autoSkillEnabled false → 로그 없음", () => {
    const s = base({ learnedSkills: ["warrior_smash_t1", "warrior_ironwall_t2"], hp: 100, maxHp: 500, autoSkillEnabled: false });
    maybeFireSkill(s, mkMonster());
    expect(s.log).toHaveLength(0);
  });
});

// ────────────────────────────────────────────
describe("신규 branch b 스킬 16개 — shouldFire / apply", () => {
  const sk = (id: string) => findSkillById(id)!;
  const low = (hpRatio: number, extra: Parameters<typeof mkSession>[0] = {}) =>
    mkSession({ hp: Math.round(500 * hpRatio), maxHp: 500, ...extra });
  const m = () => mkMonster({ hp: 400 });
  const alive = m();

  it("warrior_ironwall_t2 — hp<60% 만, DR 3/0.4", () => {
    expect(sk("warrior_ironwall_t2").shouldFire(low(0.59), alive)).toBe(true);
    expect(sk("warrior_ironwall_t2").shouldFire(low(0.6), alive)).toBe(false);
    const s = low(0.5);
    s.heroDmgReductionRounds = { rounds: 1, reduction: 0.5 };
    expect(sk("warrior_ironwall_t2").shouldFire(s, alive)).toBe(false);
    const a = low(0.5);
    sk("warrior_ironwall_t2").apply(a, alive);
    expect(a.heroDmgReductionRounds).toEqual({ rounds: 3, reduction: 0.4 });
  });

  it("warrior_warcry_t3 — 적 생존 + 미스턴, stun 1 + atk 2/1.4", () => {
    expect(sk("warrior_warcry_t3").shouldFire(low(1), alive)).toBe(true);
    expect(sk("warrior_warcry_t3").shouldFire(low(1), null)).toBe(false);
    const s = low(1);
    s.enemyStunnedRounds = 1;
    expect(sk("warrior_warcry_t3").shouldFire(s, alive)).toBe(false);
    const a = low(1);
    sk("warrior_warcry_t3").apply(a, alive);
    expect(a.enemyStunnedRounds).toBe(1);
    expect(a.heroAtkBonusRounds).toEqual({ rounds: 2, mult: 1.4 });
  });

  it("mage_manashield_t2 — hp<50%, DR 2/0.5", () => {
    expect(sk("mage_manashield_t2").shouldFire(low(0.49), alive)).toBe(true);
    expect(sk("mage_manashield_t2").shouldFire(low(0.5), alive)).toBe(false);
    const a = low(0.3);
    sk("mage_manashield_t2").apply(a, alive);
    expect(a.heroDmgReductionRounds).toEqual({ rounds: 2, reduction: 0.5 });
  });

  it("mage_chain_t3 — round(400*0.3*1.5)=180 피해 + stun 1 (기존 stun 유지)", () => {
    const a = low(1);
    sk("mage_chain_t3").apply(a, m());
    const combat = a.log.find((e) => e.type === "combat")!;
    expect(combat.damage).toBe(180);
    expect(combat.narrativeParams).toMatchObject({ monster: "M", damage: 180 });
    expect(a.enemyStunnedRounds).toBe(1);
    const b = low(1);
    b.enemyStunnedRounds = 2;
    sk("mage_chain_t3").apply(b, m());
    expect(b.enemyStunnedRounds).toBe(2);
    expect(sk("mage_chain_t3").shouldFire(low(1), null)).toBe(false);
  });

  it("monk_ironbody_t2 — hp<60%, DR 3/0.35", () => {
    expect(sk("monk_ironbody_t2").shouldFire(low(0.59), alive)).toBe(true);
    expect(sk("monk_ironbody_t2").shouldFire(low(0.6), alive)).toBe(false);
    const a = low(0.5);
    sk("monk_ironbody_t2").apply(a, alive);
    expect(a.heroDmgReductionRounds).toEqual({ rounds: 3, reduction: 0.35 });
  });

  it("monk_chainstrike_t3 — nextHeroDamageMult 없을 때만, 2.5", () => {
    expect(sk("monk_chainstrike_t3").shouldFire(low(1), alive)).toBe(true);
    const s = low(1);
    s.nextHeroDamageMult = 2;
    expect(sk("monk_chainstrike_t3").shouldFire(s, alive)).toBe(false);
    const a = low(1);
    sk("monk_chainstrike_t3").apply(a, alive);
    expect(a.nextHeroDamageMult).toBe(2.5);
  });

  it("druid_vigor_t2 — hp<50%, heal round(60*1.5)=90 (maxHp clamp) + forcedDodge 1", () => {
    expect(sk("druid_vigor_t2").shouldFire(low(0.49), alive)).toBe(true);
    expect(sk("druid_vigor_t2").shouldFire(low(0.5), alive)).toBe(false);
    const a = low(0.4); // hp 200
    sk("druid_vigor_t2").apply(a, alive);
    expect(a.hero.hp).toBe(290);
    expect(a.forcedDodgeRounds).toBe(1);
    expect(skillParams(a)).toEqual({ heal: 90 });
    const b = mkSession({ hp: 480, maxHp: 500 });
    sk("druid_vigor_t2").apply(b, alive);
    expect(b.hero.hp).toBe(500);
    expect(skillParams(b)).toEqual({ heal: 20 });
  });

  it("druid_claw_t3 — atk 버프 없을 때만, 3/1.4", () => {
    expect(sk("druid_claw_t3").shouldFire(low(1), alive)).toBe(true);
    const s = low(1);
    s.heroAtkBonusRounds = { rounds: 1, mult: 1.2 };
    expect(sk("druid_claw_t3").shouldFire(s, alive)).toBe(false);
    const a = low(1);
    sk("druid_claw_t3").apply(a, alive);
    expect(a.heroAtkBonusRounds).toEqual({ rounds: 3, mult: 1.4 });
  });

  it("bard_lullaby_t2 — 미스턴 적에게만, stun 1", () => {
    expect(sk("bard_lullaby_t2").shouldFire(low(1), alive)).toBe(true);
    const s = low(1);
    s.enemyStunnedRounds = 1;
    expect(sk("bard_lullaby_t2").shouldFire(s, alive)).toBe(false);
    const a = low(1);
    sk("bard_lullaby_t2").apply(a, alive);
    expect(a.enemyStunnedRounds).toBe(1);
  });

  it("bard_fortune_t3 — guaranteedCrit 없을 때만, coin x2 + crit 2", () => {
    expect(sk("bard_fortune_t3").shouldFire(low(1), alive)).toBe(true);
    const s = low(1);
    s.guaranteedCritAttacks = 1;
    expect(sk("bard_fortune_t3").shouldFire(s, alive)).toBe(false);
    const a = low(1);
    sk("bard_fortune_t3").apply(a, alive);
    expect(a.nextCoinMult).toBe(2);
    expect(a.guaranteedCritAttacks).toBe(2);
  });

  it("chrono_warp_t2 — hp<50% + 회피 없을 때, forcedDodge 2", () => {
    expect(sk("chrono_warp_t2").shouldFire(low(0.49), alive)).toBe(true);
    expect(sk("chrono_warp_t2").shouldFire(low(0.5), alive)).toBe(false);
    const s = low(0.3);
    s.forcedDodgeRounds = 1;
    expect(sk("chrono_warp_t2").shouldFire(s, alive)).toBe(false);
    const a = low(0.3);
    sk("chrono_warp_t2").apply(a, alive);
    expect(a.forcedDodgeRounds).toBe(2);
  });

  it("chrono_foresight_t3 — 보스 또는 hp>=150 적에게만, crit 3", () => {
    expect(sk("chrono_foresight_t3").shouldFire(low(1), mkMonster({ hp: 149 }))).toBe(false);
    expect(sk("chrono_foresight_t3").shouldFire(low(1), mkMonster({ hp: 150 }))).toBe(true);
    expect(sk("chrono_foresight_t3").shouldFire(low(1), mkMonster({ hp: 10, isBoss: true }))).toBe(true);
    const s = low(1);
    s.guaranteedCritAttacks = 2;
    expect(sk("chrono_foresight_t3").shouldFire(s, alive)).toBe(false);
    const a = low(1);
    sk("chrono_foresight_t3").apply(a, alive);
    expect(a.guaranteedCritAttacks).toBe(3);
  });

  it("priest_favor_t2 — hp<40% + 무적 없을 때, invulnerable 1", () => {
    expect(sk("priest_favor_t2").shouldFire(low(0.39), alive)).toBe(true);
    expect(sk("priest_favor_t2").shouldFire(low(0.4), alive)).toBe(false);
    const s = low(0.2);
    s.heroInvulnerableRounds = 1;
    expect(sk("priest_favor_t2").shouldFire(s, alive)).toBe(false);
    const a = low(0.2);
    sk("priest_favor_t2").apply(a, alive);
    expect(a.heroInvulnerableRounds).toBe(1);
  });

  it("priest_bless_t3 — hp<70% + atk 버프 없을 때, heal 90 + atk 3/1.25", () => {
    expect(sk("priest_bless_t3").shouldFire(low(0.69), alive)).toBe(true);
    expect(sk("priest_bless_t3").shouldFire(low(0.7), alive)).toBe(false);
    const s = low(0.5);
    s.heroAtkBonusRounds = { rounds: 2, mult: 1.2 };
    expect(sk("priest_bless_t3").shouldFire(s, alive)).toBe(false);
    const a = low(0.4); // hp 200
    sk("priest_bless_t3").apply(a, alive);
    expect(a.hero.hp).toBe(290);
    expect(a.heroAtkBonusRounds).toEqual({ rounds: 3, mult: 1.25 });
    expect(skillParams(a)).toEqual({ heal: 90 });
  });

  it("illus_shadow_t2 — hp<50% + 회피 없을 때, forcedDodge 2", () => {
    expect(sk("illus_shadow_t2").shouldFire(low(0.49), alive)).toBe(true);
    expect(sk("illus_shadow_t2").shouldFire(low(0.5), alive)).toBe(false);
    const s = low(0.3);
    s.forcedDodgeRounds = 2;
    expect(sk("illus_shadow_t2").shouldFire(s, alive)).toBe(false);
    const a = low(0.3);
    sk("illus_shadow_t2").apply(a, alive);
    expect(a.forcedDodgeRounds).toBe(2);
  });

  it("illus_burst_t3 — 180 피해, stun 없음", () => {
    expect(sk("illus_burst_t3").shouldFire(low(1), alive)).toBe(true);
    expect(sk("illus_burst_t3").shouldFire(low(1), mkMonster({ hp: 0 }))).toBe(false);
    const a = low(1);
    sk("illus_burst_t3").apply(a, m());
    const combat = a.log.find((e) => e.type === "combat")!;
    expect(combat.damage).toBe(180);
    expect(combat.narrativeKey).toBe("uphero.combat.narrative.skillHitMonster.illus_burst_t3");
    expect(a.enemyStunnedRounds).toBeUndefined();
    const skillEntry = a.log.find((e) => e.type === "skill")!;
    expect(skillEntry.narrativeParams).toEqual({ damage: 180 });
  });
});
