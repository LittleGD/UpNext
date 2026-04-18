/**
 * Up Hero — Phase 12d: class 별 스킬트리 (4 tier × 8 class = 32 skill).
 *
 * 설계:
 * - T1 (Lv30 전직 시 자동 해금): 기존 Phase 6b 스킬 유지, 비용 낮음.
 * - T2 (Lv35+, 1 포인트): 중간 화력 / 지속 효과.
 * - T3 (Lv40+, 1 포인트): 유틸리티 / 버프 / 고유 변주.
 * - T4 (Lv45+, 2 포인트): capstone, 가장 강력 + 자원 소모 큼.
 *
 * 각 스킬은:
 * - `resourceCost`: 자원 (warrior 분노 / mage 마나 등) 소모량.
 * - `cooldown`: round 단위. 발동 후 skillCooldowns[id] 세팅.
 * - `requiredLevel` / `pointCost`: 해금 조건 (hero.skillPoints 소비).
 * - `shouldFire(s, monster)`: auto 모드 발동 조건.
 * - `apply(s, monster)`: 효과 적용 + skill 로그 push.
 *
 * 자원 소모는 `canFireSkill(s, skill)` 에서 선검증.
 */

import type { ClassType, CombatSession, Monster } from "@/types/uphero";

export interface ClassSkill {
  id: string;
  class: ClassType;
  tier: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  /** 발동 시 소모되는 클래스 자원 (0 = 무료) */
  resourceCost: number;
  /** 발동 후 이 스킬의 쿨다운 (round 단위) */
  cooldown: number;
  /** 해금 가능 최소 레벨 */
  requiredLevel: number;
  /** 해금에 소모되는 스킬 포인트 (T1 = 0, T2/T3 = 1, T4 = 2) */
  pointCost: number;
  /** auto 모드 발동 조건. 수동 발동에는 canFireSkill 만 체크. */
  shouldFire(s: CombatSession, monster: Monster | null): boolean;
  /** 발동 효과 적용 + skill 로그 entry push */
  apply(s: CombatSession, monster: Monster | null): void;
}

/* ────────────────────────────────────────────
 * 로그 헬퍼
 * ──────────────────────────────────────────── */

function pushSkillLog(
  s: CombatSession,
  classType: ClassType,
  skillName: string,
  narrative: string,
): void {
  s.log.push({
    type: "skill",
    classType,
    skillName,
    narrative,
    timestamp: Date.now(),
  });
}

/* ────────────────────────────────────────────
 * warrior — 분노 (RAGE) 소모
 * ──────────────────────────────────────────── */

const warriorT1: ClassSkill = {
  id: "warrior_smash_t1",
  class: "warrior",
  tier: 1,
  name: "강타",
  description: "다음 공격 피해 2배.",
  resourceCost: 30,
  cooldown: 4,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s) {
    s.nextHeroDamageMult = 2;
    pushSkillLog(s, "warrior", "강타", "영웅이 강타를 준비한다 — 다음 공격 2배");
  },
};

const warriorT2: ClassSkill = {
  id: "warrior_berserk_t2",
  class: "warrior",
  tier: 2,
  name: "광폭화",
  description: "3 round 동안 공격 +30%.",
  resourceCost: 50,
  cooldown: 6,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.3 };
    pushSkillLog(s, "warrior", "광폭화", "영웅이 광폭화 — 3 round 공격 +30%");
  },
};

const warriorT3: ClassSkill = {
  id: "warrior_crush_t3",
  class: "warrior",
  tier: 3,
  name: "분쇄",
  description: "적 현재 HP 20% 즉시 피해.",
  resourceCost: 60,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.2);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `분쇄가 ${m.name} 을 강타한다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "warrior", "분쇄", `적 HP 20% 감소 (${dmg})`);
  },
};

const warriorT4: ClassSkill = {
  id: "warrior_rage_burst_t4",
  class: "warrior",
  tier: 4,
  name: "분노 폭발",
  description: "즉시 80 고정 피해 + 다음 3 round 공격 +50%.",
  resourceCost: 100,
  cooldown: 10,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: 80,
      outcome: "crit",
      narrative: `영웅이 분노를 폭발시킨다 — ${m.name} 에 80 고정 피해`,
      timestamp: Date.now(),
    });
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.5 };
    pushSkillLog(s, "warrior", "분노 폭발", "80 피해 + 다음 3 round 공격 +50%");
  },
};

/* ────────────────────────────────────────────
 * mage — 마나 (MANA) 소모
 * ──────────────────────────────────────────── */

const mageT1: ClassSkill = {
  id: "mage_lightning_t1",
  class: "mage",
  tier: 1,
  name: "지식의 번개",
  description: "적 현재 HP 25% 즉시 피해.",
  resourceCost: 25,
  cooldown: 6,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.25);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `영웅의 번개가 ${m.name} 을 꿰뚫는다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "mage", "지식의 번개", `적 HP 25% 감소 (${dmg})`);
  },
};

const mageT2: ClassSkill = {
  id: "mage_freeze_t2",
  class: "mage",
  tier: 2,
  name: "빙결",
  description: "적 1 round 행동 봉인.",
  resourceCost: 40,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 1;
    pushSkillLog(s, "mage", "빙결", "적이 얼어붙었다 — 1 round 공격 불가");
  },
};

const mageT3: ClassSkill = {
  id: "mage_fireball_t3",
  class: "mage",
  tier: 3,
  name: "화염구",
  description: "즉시 50 고정 피해.",
  resourceCost: 55,
  cooldown: 5,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: 50,
      outcome: "crit",
      narrative: `불꽃이 ${m.name} 을 휩싼다 — 50 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "mage", "화염구", "50 고정 피해");
  },
};

const mageT4: ClassSkill = {
  id: "mage_meteor_t4",
  class: "mage",
  tier: 4,
  name: "메테오",
  description: "적 현재 HP 40% 피해.",
  resourceCost: 90,
  cooldown: 12,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.4);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `메테오가 ${m.name} 을 내리친다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "mage", "메테오", `적 HP 40% 감소 (${dmg})`);
  },
};

/* ────────────────────────────────────────────
 * monk — 기 (CHI) 소모
 * ──────────────────────────────────────────── */

const monkT1: ClassSkill = {
  id: "monk_zen_t1",
  class: "monk",
  tier: 1,
  name: "선정",
  description: "2 round 회피 100%.",
  resourceCost: 40,
  cooldown: 8,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5,
  apply(s) {
    s.forcedDodgeRounds = 2;
    pushSkillLog(s, "monk", "선정", "영웅이 선정에 든다 — 2 round 회피 100%");
  },
};

const monkT2: ClassSkill = {
  id: "monk_flash_t2",
  class: "monk",
  tier: 2,
  name: "일섬",
  description: "적 현재 HP 30% 즉시 피해.",
  resourceCost: 60,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.3);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `일섬 — ${m.name} 을 베어낸다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "monk", "일섬", `적 HP 30% 감소 (${dmg})`);
  },
};

const monkT3: ClassSkill = {
  id: "monk_taiji_t3",
  class: "monk",
  tier: 3,
  name: "태극",
  description: "HP +50 회복 + 다음 2 round 공격 +20%.",
  resourceCost: 70,
  cooldown: 6,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.7,
  apply(s) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 50);
    s.heroAtkBonusRounds = { rounds: 2, mult: 1.2 };
    pushSkillLog(s, "monk", "태극", "HP +50 · 2 round 공격 +20%");
  },
};

const monkT4: ClassSkill = {
  id: "monk_lotus_t4",
  class: "monk",
  tier: 4,
  name: "연화",
  description: "3 round 무적.",
  resourceCost: 90,
  cooldown: 14,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.3,
  apply(s) {
    s.heroInvulnerableRounds = 3;
    pushSkillLog(s, "monk", "연화", "연꽃이 영웅을 감싼다 — 3 round 무적");
  },
};

/* ────────────────────────────────────────────
 * druid — 자연력 (NAT) 소모
 * ──────────────────────────────────────────── */

const druidT1: ClassSkill = {
  id: "druid_ward_t1",
  class: "druid",
  tier: 1,
  name: "치유 결계",
  description: "HP +40 회복.",
  resourceCost: 30,
  cooldown: 5,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6,
  apply(s) {
    const healed = Math.min(s.hero.maxHp - s.hero.hp, 40);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 40);
    pushSkillLog(s, "druid", "치유 결계", `HP +${healed}`);
  },
};

const druidT2: ClassSkill = {
  id: "druid_root_t2",
  class: "druid",
  tier: 2,
  name: "뿌리옥죄기",
  description: "적 2 round 행동 봉인.",
  resourceCost: 50,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 2;
    pushSkillLog(s, "druid", "뿌리옥죄기", "뿌리가 적을 잡아챈다 — 2 round 봉인");
  },
};

const druidT3: ClassSkill = {
  id: "druid_grove_t3",
  class: "druid",
  tier: 3,
  name: "숲의 포옹",
  description: "HP +80 회복 + 다음 3 round 피해 -30%.",
  resourceCost: 60,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5,
  apply(s) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 80);
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.3 };
    pushSkillLog(s, "druid", "숲의 포옹", "HP +80 · 3 round 피해 -30%");
  },
};

const druidT4: ClassSkill = {
  id: "druid_wild_call_t4",
  class: "druid",
  tier: 4,
  name: "야생의 부름",
  description: "적 HP 30% 피해 + HP +100 회복.",
  resourceCost: 85,
  cooldown: 12,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.3);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `야생의 짐승이 ${m.name} 을 공격한다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 100);
    pushSkillLog(s, "druid", "야생의 부름", `적 HP 30% (${dmg}) · HP +100`);
  },
};

/* ────────────────────────────────────────────
 * bard — 영감 (INSP) 소모
 * ──────────────────────────────────────────── */

const bardT1: ClassSkill = {
  id: "bard_song_t1",
  class: "bard",
  tier: 1,
  name: "노래",
  description: "다음 처치 코인 1.5배.",
  resourceCost: 25,
  cooldown: 4,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: () => true,
  apply(s) {
    s.nextCoinMult = 1.5;
    pushSkillLog(s, "bard", "노래", "용기의 노래 — 다음 처치 보상 1.5배");
  },
};

const bardT2: ClassSkill = {
  id: "bard_ensemble_t2",
  class: "bard",
  tier: 2,
  name: "협연",
  description: "다음 3 round 공격 +25%.",
  resourceCost: 50,
  cooldown: 5,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s) => !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.25 };
    pushSkillLog(s, "bard", "협연", "3 round 공격 +25%");
  },
};

const bardT3: ClassSkill = {
  id: "bard_anthem_t3",
  class: "bard",
  tier: 3,
  name: "영웅가",
  description: "HP +30 + 다음 3 round 피해 -25%.",
  resourceCost: 60,
  cooldown: 6,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.7,
  apply(s) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 30);
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.25 };
    pushSkillLog(s, "bard", "영웅가", "HP +30 · 3 round 피해 -25%");
  },
};

const bardT4: ClassSkill = {
  id: "bard_epic_t4",
  class: "bard",
  tier: 4,
  name: "대서사시",
  description: "다음 5 공격 반드시 crit.",
  resourceCost: 80,
  cooldown: 10,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.guaranteedCritAttacks,
  apply(s) {
    s.guaranteedCritAttacks = 5;
    pushSkillLog(s, "bard", "대서사시", "다음 5 공격 반드시 crit");
  },
};

/* ────────────────────────────────────────────
 * chronomancer — 시간 파편 (TIME) 소모
 * ──────────────────────────────────────────── */

const chronoT1: ClassSkill = {
  id: "chrono_rewind_t1",
  class: "chronomancer",
  tier: 1,
  name: "시간 되감기",
  description: "시간 +10.",
  resourceCost: 30,
  cooldown: 7,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (s) => s.time < s.maxTime * 0.5,
  apply(s) {
    const restore = Math.min(s.maxTime - s.time, 10);
    s.time = Math.min(s.maxTime, s.time + 10);
    pushSkillLog(s, "chronomancer", "시간 되감기", `시간 +${restore}`);
  },
};

const chronoT2: ClassSkill = {
  id: "chrono_accel_t2",
  class: "chronomancer",
  tier: 2,
  name: "시간 가속",
  description: "모든 스킬 쿨다운 즉시 -2.",
  resourceCost: 60,
  cooldown: 6,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s) => {
    // 어떤 skill 이든 cd 남아있으면 의미 있음
    const cds = s.skillCooldowns ?? {};
    return Object.values(cds).some((v) => v > 0);
  },
  apply(s) {
    const cds = { ...(s.skillCooldowns ?? {}) };
    for (const k of Object.keys(cds)) cds[k] = Math.max(0, cds[k] - 2);
    s.skillCooldowns = cds;
    pushSkillLog(s, "chronomancer", "시간 가속", "모든 스킬 CD -2");
  },
};

const chronoT3: ClassSkill = {
  id: "chrono_stop_t3",
  class: "chronomancer",
  tier: 3,
  name: "시간 정지",
  description: "적 2 round 행동 봉인.",
  resourceCost: 70,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 2;
    pushSkillLog(s, "chronomancer", "시간 정지", "시간이 멈춘다 — 2 round 봉인");
  },
};

const chronoT4: ClassSkill = {
  id: "chrono_reflux_t4",
  class: "chronomancer",
  tier: 4,
  name: "시간 역류",
  description: "HP 완전 회복 + 시간 +30.",
  resourceCost: 90,
  cooldown: 14,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (s) =>
    s.hero.hp < s.hero.maxHp * 0.4 || s.time < s.maxTime * 0.3,
  apply(s) {
    s.hero.hp = s.hero.maxHp;
    s.time = Math.min(s.maxTime, s.time + 30);
    pushSkillLog(s, "chronomancer", "시간 역류", "HP 완전 회복 · 시간 +30");
  },
};

/* ────────────────────────────────────────────
 * priest — 신앙 (FAITH) 소모
 * ──────────────────────────────────────────── */

const priestT1: ClassSkill = {
  id: "priest_light_t1",
  class: "priest",
  tier: 1,
  name: "성스러운 빛",
  description: "HP 완전 회복.",
  resourceCost: 20,
  cooldown: 10,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.2,
  apply(s) {
    const healed = s.hero.maxHp - s.hero.hp;
    s.hero.hp = s.hero.maxHp;
    pushSkillLog(s, "priest", "성스러운 빛", `HP 완전 회복 (+${healed})`);
  },
};

const priestT2: ClassSkill = {
  id: "priest_purge_t2",
  class: "priest",
  tier: 2,
  name: "정화",
  description: "HP +40 + 다음 3 round 피해 -30%.",
  resourceCost: 45,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6,
  apply(s) {
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 40);
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.3 };
    pushSkillLog(s, "priest", "정화", "HP +40 · 3 round 피해 -30%");
  },
};

const priestT3: ClassSkill = {
  id: "priest_judgment_t3",
  class: "priest",
  tier: 3,
  name: "심판",
  description: "적 현재 HP 25% 성스러운 피해.",
  resourceCost: 60,
  cooldown: 6,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.25);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `심판 — ${m.name} 이 빛에 타들어간다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "priest", "심판", `적 HP 25% (${dmg})`);
  },
};

const priestT4: ClassSkill = {
  id: "priest_revive_t4",
  class: "priest",
  tier: 4,
  name: "부활",
  description: "다음 죽음 1회 무효 (HP 50%).",
  resourceCost: 100,
  cooldown: 20,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (s) => !s.revivePending,
  apply(s) {
    s.revivePending = true;
    pushSkillLog(s, "priest", "부활", "부활의 축복이 준비된다");
  },
};

/* ────────────────────────────────────────────
 * illusionist — 환기 (ESNC) 소모
 * ──────────────────────────────────────────── */

const illusT1: ClassSkill = {
  id: "illus_mirage_t1",
  class: "illusionist",
  tier: 1,
  name: "환영",
  description: "다음 3 적 공격 miss.",
  resourceCost: 30,
  cooldown: 6,
  requiredLevel: 30,
  pointCost: 0,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.4,
  apply(s) {
    s.forcedEnemyMisses = 3;
    pushSkillLog(s, "illusionist", "환영", "환영 — 다음 3 공격 miss");
  },
};

const illusT2: ClassSkill = {
  id: "illus_double_t2",
  class: "illusionist",
  tier: 2,
  name: "분신",
  description: "다음 2 round 공격 2배.",
  resourceCost: 50,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  shouldFire: (s) => !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 2, mult: 2.0 };
    pushSkillLog(s, "illusionist", "분신", "2 round 공격 2배");
  },
};

const illusT3: ClassSkill = {
  id: "illus_charm_t3",
  class: "illusionist",
  tier: 3,
  name: "환혹",
  description: "적 2 round 무력화.",
  resourceCost: 65,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 2;
    pushSkillLog(s, "illusionist", "환혹", "적이 홀려 움직이지 못한다 — 2 round");
  },
};

const illusT4: ClassSkill = {
  id: "illus_dreamscape_t4",
  class: "illusionist",
  tier: 4,
  name: "환몽",
  description: "3 round 무적.",
  resourceCost: 85,
  cooldown: 12,
  requiredLevel: 45,
  pointCost: 2,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.3,
  apply(s) {
    s.heroInvulnerableRounds = 3;
    pushSkillLog(s, "illusionist", "환몽", "영웅이 꿈 속으로 — 3 round 무적");
  },
};

/* ────────────────────────────────────────────
 * CLASS_SKILL_TREES — 각 클래스의 4 tier 스킬 배열
 * ──────────────────────────────────────────── */

export const CLASS_SKILL_TREES: Record<ClassType, ClassSkill[]> = {
  warrior: [warriorT1, warriorT2, warriorT3, warriorT4],
  mage: [mageT1, mageT2, mageT3, mageT4],
  monk: [monkT1, monkT2, monkT3, monkT4],
  druid: [druidT1, druidT2, druidT3, druidT4],
  bard: [bardT1, bardT2, bardT3, bardT4],
  chronomancer: [chronoT1, chronoT2, chronoT3, chronoT4],
  priest: [priestT1, priestT2, priestT3, priestT4],
  illusionist: [illusT1, illusT2, illusT3, illusT4],
};

/**
 * @deprecated Phase 12d — `CLASS_SKILL_TREES` 의 T1 을 대신 사용.
 *   기존 `CLASS_SKILLS` 직접 참조는 T1 을 반환해 legacy 호환 유지.
 */
export const CLASS_SKILLS: Record<ClassType, ClassSkill> = {
  warrior: warriorT1,
  mage: mageT1,
  monk: monkT1,
  druid: druidT1,
  bard: bardT1,
  chronomancer: chronoT1,
  priest: priestT1,
  illusionist: illusT1,
};

/** skillId → ClassSkill lookup (어느 트리에 속한지와 무관). */
export function findSkillById(id: string): ClassSkill | null {
  for (const tree of Object.values(CLASS_SKILL_TREES)) {
    const s = tree.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}

/* ────────────────────────────────────────────
 * 발동 로직 — 자원 체크 + 쿨다운 + apply
 * ──────────────────────────────────────────── */

/** 스킬 발동 가능 여부 체크 (자원 + 쿨다운 + 해금). */
export function canFireSkill(
  s: CombatSession,
  skillId: string,
): { ok: boolean; reason?: "locked" | "cooldown" | "resource" } {
  const skill = findSkillById(skillId);
  if (!skill) return { ok: false, reason: "locked" };
  const learned = s.hero.learnedSkills ?? [];
  if (!learned.includes(skillId)) return { ok: false, reason: "locked" };
  const cd = (s.skillCooldowns ?? {})[skillId] ?? 0;
  if (cd > 0) return { ok: false, reason: "cooldown" };
  const resource = s.classResource ?? 0;
  if (resource < skill.resourceCost) return { ok: false, reason: "resource" };
  return { ok: true };
}

/** 스킬 fire — 자원 차감 + apply + 쿨다운 세팅. canFireSkill 통과 시에만 호출. */
export function fireSkill(
  s: CombatSession,
  skillId: string,
  monster: Monster | null,
): boolean {
  const check = canFireSkill(s, skillId);
  if (!check.ok) return false;
  const skill = findSkillById(skillId)!;
  // 자원 차감
  s.classResource = Math.max(0, (s.classResource ?? 0) - skill.resourceCost);
  // apply
  skill.apply(s, monster);
  // 쿨다운 세팅
  const cds = { ...(s.skillCooldowns ?? {}) };
  cds[skillId] = skill.cooldown;
  s.skillCooldowns = cds;
  // 기존 skillCooldown (T1 호환) 도 갱신
  s.skillCooldown = skill.cooldown;
  return true;
}

/**
 * Phase 12d — auto 모드 스킬 시도. maybeFireSkill 대체.
 *   해금된 스킬 중 자원 충족 + 쿨다운 0 + shouldFire true 인 것들 중 **상위 tier
 *   우선** 발동 (T4 > T3 > T2 > T1). 1 round 당 최대 1 스킬.
 */
export function maybeFireSkill(
  s: CombatSession,
  monster: Monster | null,
): void {
  const cls = s.hero.classType;
  if (!cls) return;
  if (s.hero.autoSkillEnabled === false) return;

  const learned = s.hero.learnedSkills ?? [];
  const tree = CLASS_SKILL_TREES[cls];
  // tier 내림차순 (T4 우선)
  const candidates = tree
    .filter((sk) => learned.includes(sk.id))
    .sort((a, b) => b.tier - a.tier);
  for (const sk of candidates) {
    const check = canFireSkill(s, sk.id);
    if (!check.ok) continue;
    if (!sk.shouldFire(s, monster)) continue;
    fireSkill(s, sk.id, monster);
    return; // 1 round 1 스킬
  }
}

/** Combat round 종료 시 호출 — 모든 skill 쿨다운 -1 + 지속 효과 카운터 감소. */
export function advanceSkillCounters(s: CombatSession): void {
  // 모든 skill cooldown
  if (s.skillCooldowns) {
    const cds = { ...s.skillCooldowns };
    for (const k of Object.keys(cds)) {
      cds[k] = Math.max(0, cds[k] - 1);
    }
    s.skillCooldowns = cds;
  }
  // T1 호환
  if (s.skillCooldown != null && s.skillCooldown > 0) {
    s.skillCooldown -= 1;
  }
  // 지속 효과
  if (s.forcedDodgeRounds != null && s.forcedDodgeRounds > 0) {
    s.forcedDodgeRounds -= 1;
    if (s.forcedDodgeRounds === 0) delete s.forcedDodgeRounds;
  }
  if (s.heroAtkBonusRounds && s.heroAtkBonusRounds.rounds > 0) {
    s.heroAtkBonusRounds.rounds -= 1;
    if (s.heroAtkBonusRounds.rounds <= 0) delete s.heroAtkBonusRounds;
  }
  if (s.enemyStunnedRounds != null && s.enemyStunnedRounds > 0) {
    s.enemyStunnedRounds -= 1;
    if (s.enemyStunnedRounds === 0) delete s.enemyStunnedRounds;
  }
  if (s.heroDmgReductionRounds && s.heroDmgReductionRounds.rounds > 0) {
    s.heroDmgReductionRounds.rounds -= 1;
    if (s.heroDmgReductionRounds.rounds <= 0) delete s.heroDmgReductionRounds;
  }
  if (s.heroInvulnerableRounds != null && s.heroInvulnerableRounds > 0) {
    s.heroInvulnerableRounds -= 1;
    if (s.heroInvulnerableRounds === 0) delete s.heroInvulnerableRounds;
  }
}
