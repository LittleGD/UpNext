/**
 * Up Hero — Phase 12d: class 별 스킬트리 (4 tier × 8 class).
 *
 * Phase 3-F (피드백 34b) — 트리가 선형 4칸에서 6노드 분기 트리로 바뀌었다:
 *   `[T1, T2a, T2b, T3a, T3b, T4]`.
 * - 기존 T2/T3 16개는 branch "a" 로 편입 (id·수치·i18n 키 불변 → 레거시 저장본
 *   마이그레이션 없음). 신규 branch "b" 16개는 기존 CombatSession 프리미티브만 쓴다.
 * - `requires` (any-of): T2.requires=[T1], T3.requires=[T2a,T2b], T4.requires=[T3a,T3b].
 * - 같은 class·같은 tier 의 두 스킬은 형제 (getSiblingSkill). 둘 중 하나만 배울 수
 *   있다 (getSkillLearnStatus → "branch"). 리스펙(useUpHeroStore.respecSkills)이 유일한
 *   출구.
 * - 학습 규칙은 getSkillLearnStatus 한 곳 (스토어·SkillTreePanel·동치 검증이 공유).
 *
 * 설계:
 * - T1 (Lv30 전직 시 자동 해금): 기존 Phase 6b 스킬 유지, 비용 낮음.
 * - T2 (Lv35+, 1 포인트): 중간 화력 / 지속 효과. a/b 택일.
 * - T3 (Lv40+, 1 포인트): 유틸리티 / 버프 / 고유 변주. a/b 택일.
 * - T4 (Lv45+, 2 포인트): capstone, 가장 강력 + 자원 소모 큼. T3 하나 배우면 열림.
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

import type {
  ClassType,
  CombatSession,
  Monster,
  NarrativeParams,
} from "@/types/uphero";
import { computeEffectiveStats } from "@/types/uphero";

/* ────────────────────────────────────────────
 * INT 스케일링 — 스킬 데미지/회복량에 INT 반영
 *
 * Phase 13e — 이전에 INT 는 type 시그니처만 존재하고 전투 공식 어디에도
 *   참조되지 않는 dead stat 이었다. 기본/장비 affix 로 INT 올려도 아무 효과 X.
 *   이제 스킬 데미지·회복량에 1 INT 당 +1% 배율 적용 → 클래스 차별화 + INT
 *   장비/affix 의미 부여.
 *
 * 공식:
 *   - skill damage × (1 + int × 0.01)
 *   - skill heal   × (1 + int × 0.01)
 *
 * 예) 50 INT (Lv41 순정 기준) → 스킬 피해/회복량 +50%.
 *     기본 공격은 STR 이 담당 — INT 는 스킬/마법 전용.
 * ──────────────────────────────────────────── */
function getIntMult(s: CombatSession): number {
  const int = computeEffectiveStats(s.hero).int;
  return 1 + int * 0.01;
}

export interface ClassSkill {
  id: string;
  /**
   * Phase 14 — 전직 전 tutorial 스킬을 위해 `"novice"` 확장.
   *   NOVICE_SKILLS 는 class="novice" 이며 classType 조건 없이 learnedSkills 로만 판정.
   */
  class: ClassType | "novice";
  tier: 0 | 1 | 2 | 3 | 4;
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
  /**
   * Phase 3-F — 분기. T2/T3 만 "a"|"b" (T1/T4 는 undefined).
   *   같은 class·tier 의 다른 branch 가 형제이며 둘 중 하나만 배운다.
   */
  branch?: "a" | "b";
  /** Phase 3-F — 선행 스킬 id (any-of: 하나라도 배웠으면 충족). T1 은 undefined. */
  requires?: string[];
  /** auto 모드 발동 조건. 수동 발동에는 canFireSkill 만 체크. */
  shouldFire(s: CombatSession, monster: Monster | null): boolean;
  /** 발동 효과 적용 + skill 로그 entry push */
  apply(s: CombatSession, monster: Monster | null): void;
}

/* ────────────────────────────────────────────
 * 로그 헬퍼
 * ──────────────────────────────────────────── */

/**
 * Phase 13c → 14 — skill 로그 push.
 *
 * Phase 14 code-review Medium #15 (P1 TODO follow-through) — 이전 시그니처의 6번째
 *   param `narrativeKey` 는 32 call site 모두 `uphero.skill.${skillId}.narrative`
 *   였으므로 auto-derive 로 전환. 호출부는 narrativeKey 인자를 제거하고 더 짧아짐.
 *   향후 신규 skill 추가 시 네이밍 컨벤션 (skillId 기반) 만 지키면 narrativeKey
 *   누락 버그 자체가 발생 불가.
 */
function pushSkillLog(
  s: CombatSession,
  classType: ClassType | "novice",
  skillName: string,
  narrative: string,
  skillId?: string,
  narrativeParams?: NarrativeParams,
): void {
  s.log.push({
    type: "skill",
    classType,
    skillId,
    skillName,
    narrative,
    narrativeKey: skillId ? `uphero.skill.${skillId}.narrative` : undefined,
    narrativeParams,
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
    pushSkillLog(
      s,
      "warrior",
      "강타",
      "영웅이 강타를 준비한다: 다음 공격 2배",
      "warrior_smash_t1",
    );
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
  branch: "a",
  requires: ["warrior_smash_t1"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.3 };
    pushSkillLog(
      s,
      "warrior",
      "광폭화",
      "영웅이 광폭화: 3 round 공격 +30%",
      "warrior_berserk_t2",
    );
  },
};

const warriorT2b: ClassSkill = {
  id: "warrior_ironwall_t2",
  class: "warrior",
  tier: 2,
  name: "철벽",
  description: "3 round 동안 받는 피해 -40%.",
  resourceCost: 45,
  cooldown: 6,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["warrior_smash_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6 && !s.heroDmgReductionRounds,
  apply(s) {
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.4 };
    pushSkillLog(
      s,
      "warrior",
      "철벽",
      "영웅이 철벽처럼 버틴다. 3 round 피해 -40%",
      "warrior_ironwall_t2",
    );
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
  branch: "a",
  requires: ["warrior_berserk_t2", "warrior_ironwall_t2"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.2 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `분쇄가 ${m.name} 을 강타한다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.warrior_crush_t3",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "warrior",
      "분쇄",
      `적 HP 20% 감소 (${dmg})`,
      "warrior_crush_t3",
      { damage: dmg },
    );
  },
};

const warriorT3b: ClassSkill = {
  id: "warrior_warcry_t3",
  class: "warrior",
  tier: 3,
  name: "전쟁의 함성",
  description: "적 1 round 봉인 + 다음 2 round 공격 +40%.",
  resourceCost: 60,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["warrior_berserk_t2", "warrior_ironwall_t2"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 1;
    s.heroAtkBonusRounds = { rounds: 2, mult: 1.4 };
    pushSkillLog(
      s,
      "warrior",
      "전쟁의 함성",
      "전쟁의 함성이 울린다. 적 1 round 봉인, 2 round 공격 +40%",
      "warrior_warcry_t3",
    );
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
  requires: ["warrior_crush_t3", "warrior_warcry_t3"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(80 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `영웅이 분노를 폭발시킨다, ${m.name} 에 ${dmg} 고정 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.warrior_rage_burst_t4",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.5 };
    pushSkillLog(
      s,
      "warrior",
      "분노 폭발",
      `${dmg} 피해 + 다음 3 round 공격 +50%`,
      "warrior_rage_burst_t4",
      { damage: dmg },
    );
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
    const dmg = Math.round(m.hp * 0.25 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `영웅의 번개가 ${m.name} 을 꿰뚫는다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.mage_lightning_t1",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "mage",
      "지식의 번개",
      `적 HP 25% 감소 (${dmg})`,
      "mage_lightning_t1",
      { damage: dmg },
    );
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
  branch: "a",
  requires: ["mage_lightning_t1"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 1;
    pushSkillLog(
      s,
      "mage",
      "빙결",
      "적이 얼어붙었다: 1 round 공격 불가",
      "mage_freeze_t2",
    );
  },
};

const mageT2b: ClassSkill = {
  id: "mage_manashield_t2",
  class: "mage",
  tier: 2,
  name: "마나 방패",
  description: "2 round 동안 받는 피해 -50%.",
  resourceCost: 40,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["mage_lightning_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5 && !s.heroDmgReductionRounds,
  apply(s) {
    s.heroDmgReductionRounds = { rounds: 2, reduction: 0.5 };
    pushSkillLog(
      s,
      "mage",
      "마나 방패",
      "마나 방패가 펼쳐진다. 2 round 피해 -50%",
      "mage_manashield_t2",
    );
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
  branch: "a",
  requires: ["mage_freeze_t2", "mage_manashield_t2"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(50 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `불꽃이 ${m.name} 을 휩싼다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.mage_fireball_t3",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "mage",
      "화염구",
      `${dmg} 고정 피해`,
      "mage_fireball_t3",
      { damage: dmg },
    );
  },
};

const mageT3b: ClassSkill = {
  id: "mage_chain_t3",
  class: "mage",
  tier: 3,
  name: "연쇄 번개",
  description: "적 현재 HP 30% 피해 + 1 round 봉인.",
  resourceCost: 60,
  cooldown: 7,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["mage_freeze_t2", "mage_manashield_t2"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.3 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `연쇄 번개가 ${m.name} 을 관통한다. ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.mage_chain_t3",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    if (!s.enemyStunnedRounds) s.enemyStunnedRounds = 1;
    pushSkillLog(
      s,
      "mage",
      "연쇄 번개",
      `연쇄 번개가 적을 관통한다 (${dmg}), 1 round 봉인`,
      "mage_chain_t3",
      { damage: dmg },
    );
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
  requires: ["mage_fireball_t3", "mage_chain_t3"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.4 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `메테오가 ${m.name} 을 내리친다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.mage_meteor_t4",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "mage",
      "메테오",
      `적 HP 40% 감소 (${dmg})`,
      "mage_meteor_t4",
      { damage: dmg },
    );
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
    pushSkillLog(
      s,
      "monk",
      "선정",
      "영웅이 선정에 든다: 2 round 회피 100%",
      "monk_zen_t1",
    );
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
  branch: "a",
  requires: ["monk_zen_t1"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.3 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `일섬: ${m.name} 을 베어낸다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.monk_flash_t2",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "monk",
      "일섬",
      `적 HP 30% 감소 (${dmg})`,
      "monk_flash_t2",
      { damage: dmg },
    );
  },
};

const monkT2b: ClassSkill = {
  id: "monk_ironbody_t2",
  class: "monk",
  tier: 2,
  name: "철포삼",
  description: "3 round 동안 받는 피해 -35%.",
  resourceCost: 50,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["monk_zen_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6 && !s.heroDmgReductionRounds,
  apply(s) {
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.35 };
    pushSkillLog(
      s,
      "monk",
      "철포삼",
      "영웅의 몸이 강철이 된다. 3 round 피해 -35%",
      "monk_ironbody_t2",
    );
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
  branch: "a",
  requires: ["monk_flash_t2", "monk_ironbody_t2"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.7,
  apply(s) {
    const heal = Math.round(50 * getIntMult(s));
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    s.heroAtkBonusRounds = { rounds: 2, mult: 1.2 };
    pushSkillLog(
      s,
      "monk",
      "태극",
      `HP +${heal} · 2 round 공격 +20%`,
      "monk_taiji_t3",
      { heal },
    );
  },
};

const monkT3b: ClassSkill = {
  id: "monk_chainstrike_t3",
  class: "monk",
  tier: 3,
  name: "연환격",
  description: "다음 공격 피해 2.5배.",
  resourceCost: 65,
  cooldown: 6,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["monk_flash_t2", "monk_ironbody_t2"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.nextHeroDamageMult,
  apply(s) {
    s.nextHeroDamageMult = 2.5;
    pushSkillLog(
      s,
      "monk",
      "연환격",
      "연환격을 준비한다. 다음 공격 2.5배",
      "monk_chainstrike_t3",
    );
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
  requires: ["monk_taiji_t3", "monk_chainstrike_t3"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.3,
  apply(s) {
    s.heroInvulnerableRounds = 3;
    pushSkillLog(
      s,
      "monk",
      "연화",
      "연꽃이 영웅을 감싼다: 3 round 무적",
      "monk_lotus_t4",
    );
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
    const heal = Math.round(40 * getIntMult(s));
    const healed = Math.min(s.hero.maxHp - s.hero.hp, heal);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    pushSkillLog(
      s,
      "druid",
      "치유 결계",
      `HP +${healed}`,
      "druid_ward_t1",
      { heal: healed },
    );
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
  branch: "a",
  requires: ["druid_ward_t1"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 2;
    pushSkillLog(
      s,
      "druid",
      "뿌리옥죄기",
      "뿌리가 적을 잡아챈다: 2 round 봉인",
      "druid_root_t2",
    );
  },
};

const druidT2b: ClassSkill = {
  id: "druid_vigor_t2",
  class: "druid",
  tier: 2,
  name: "자연의 활력",
  description: "HP +60 회복 + 1 round 회피 100%.",
  resourceCost: 50,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["druid_ward_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5,
  apply(s) {
    const heal = Math.round(60 * getIntMult(s));
    const healed = Math.min(s.hero.maxHp - s.hero.hp, heal);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    s.forcedDodgeRounds = 1;
    pushSkillLog(
      s,
      "druid",
      "자연의 활력",
      `자연의 활력이 흐른다. HP +${healed}, 1 round 회피`,
      "druid_vigor_t2",
      { heal: healed },
    );
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
  branch: "a",
  requires: ["druid_root_t2", "druid_vigor_t2"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5,
  apply(s) {
    const heal = Math.round(80 * getIntMult(s));
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.3 };
    pushSkillLog(
      s,
      "druid",
      "숲의 포옹",
      `HP +${heal} · 3 round 피해 -30%`,
      "druid_grove_t3",
      { heal },
    );
  },
};

const druidT3b: ClassSkill = {
  id: "druid_claw_t3",
  class: "druid",
  tier: 3,
  name: "맹수의 발톱",
  description: "3 round 동안 공격 +40%.",
  resourceCost: 60,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["druid_root_t2", "druid_vigor_t2"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.4 };
    pushSkillLog(
      s,
      "druid",
      "맹수의 발톱",
      "맹수의 발톱이 돋는다. 3 round 공격 +40%",
      "druid_claw_t3",
    );
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
  requires: ["druid_grove_t3", "druid_claw_t3"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const intMult = getIntMult(s);
    const dmg = Math.round(m.hp * 0.3 * intMult);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `야생의 짐승이 ${m.name} 을 공격한다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.druid_wild_call_t4",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    const heal = Math.round(100 * intMult);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    pushSkillLog(
      s,
      "druid",
      "야생의 부름",
      `적 HP 30% (${dmg}) · HP +${heal}`,
      "druid_wild_call_t4",
      { damage: dmg, heal },
    );
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
    pushSkillLog(
      s,
      "bard",
      "노래",
      "용기의 노래: 다음 처치 보상 1.5배",
      "bard_song_t1",
    );
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
  branch: "a",
  requires: ["bard_song_t1"],
  shouldFire: (s) => !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.25 };
    pushSkillLog(
      s,
      "bard",
      "협연",
      "3 round 공격 +25%",
      "bard_ensemble_t2",
    );
  },
};

const bardT2b: ClassSkill = {
  id: "bard_lullaby_t2",
  class: "bard",
  tier: 2,
  name: "자장가",
  description: "적 1 round 행동 봉인.",
  resourceCost: 45,
  cooldown: 6,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["bard_song_t1"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 1;
    pushSkillLog(
      s,
      "bard",
      "자장가",
      "자장가가 적을 재운다. 1 round 봉인",
      "bard_lullaby_t2",
    );
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
  branch: "a",
  requires: ["bard_ensemble_t2", "bard_lullaby_t2"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.7,
  apply(s) {
    const heal = Math.round(30 * getIntMult(s));
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.25 };
    pushSkillLog(
      s,
      "bard",
      "영웅가",
      `HP +${heal} · 3 round 피해 -25%`,
      "bard_anthem_t3",
      { heal },
    );
  },
};

const bardT3b: ClassSkill = {
  id: "bard_fortune_t3",
  class: "bard",
  tier: 3,
  name: "행운의 노래",
  description: "다음 처치 코인 2배 + 다음 2 공격 반드시 crit.",
  resourceCost: 60,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["bard_ensemble_t2", "bard_lullaby_t2"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.guaranteedCritAttacks,
  apply(s) {
    s.nextCoinMult = 2.0;
    s.guaranteedCritAttacks = 2;
    pushSkillLog(
      s,
      "bard",
      "행운의 노래",
      "행운의 노래. 다음 처치 코인 2배, 다음 2 공격 crit",
      "bard_fortune_t3",
    );
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
  requires: ["bard_anthem_t3", "bard_fortune_t3"],
  // Phase 13 review Critical #4 — boss 또는 고 HP 적 전용 발동. 이전엔 일반
  //   몬스터 만나면 즉시 발동 → 5 crit 낭비 후 보스전에 자원 부족. 이제 보스
  //   또는 HP 150+ (F8+ 몬스터 수준) 에서만 트리거.
  shouldFire: (s, m) =>
    !!m && m.hp > 0 && !s.guaranteedCritAttacks && (!!m.isBoss || m.hp >= 150),
  apply(s) {
    s.guaranteedCritAttacks = 5;
    pushSkillLog(
      s,
      "bard",
      "대서사시",
      "다음 5 공격 반드시 crit",
      "bard_epic_t4",
    );
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
    pushSkillLog(
      s,
      "chronomancer",
      "시간 되감기",
      `시간 +${restore}`,
      "chrono_rewind_t1",
      { time: restore },
    );
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
  branch: "a",
  requires: ["chrono_rewind_t1"],
  shouldFire: (s) => {
    // 어떤 skill 이든 cd 남아있으면 의미 있음
    const cds = s.skillCooldowns ?? {};
    return Object.values(cds).some((v) => v > 0);
  },
  apply(s) {
    const cds = { ...(s.skillCooldowns ?? {}) };
    for (const k of Object.keys(cds)) cds[k] = Math.max(0, cds[k] - 2);
    s.skillCooldowns = cds;
    pushSkillLog(
      s,
      "chronomancer",
      "시간 가속",
      "모든 스킬 CD -2",
      "chrono_accel_t2",
    );
  },
};

const chronoT2b: ClassSkill = {
  id: "chrono_warp_t2",
  class: "chronomancer",
  tier: 2,
  name: "시간 왜곡",
  description: "2 round 회피 100%.",
  resourceCost: 55,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["chrono_rewind_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5 && !s.forcedDodgeRounds,
  apply(s) {
    s.forcedDodgeRounds = 2;
    pushSkillLog(
      s,
      "chronomancer",
      "시간 왜곡",
      "시간이 왜곡된다. 2 round 회피 100%",
      "chrono_warp_t2",
    );
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
  branch: "a",
  requires: ["chrono_accel_t2", "chrono_warp_t2"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 2;
    pushSkillLog(
      s,
      "chronomancer",
      "시간 정지",
      "시간이 멈춘다: 2 round 봉인",
      "chrono_stop_t3",
    );
  },
};

const chronoT3b: ClassSkill = {
  id: "chrono_foresight_t3",
  class: "chronomancer",
  tier: 3,
  name: "미래 예지",
  description: "다음 3 공격 반드시 crit.",
  resourceCost: 65,
  cooldown: 8,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["chrono_accel_t2", "chrono_warp_t2"],
  shouldFire: (s, m) =>
    !!m && m.hp > 0 && !s.guaranteedCritAttacks && (!!m.isBoss || m.hp >= 150),
  apply(s) {
    s.guaranteedCritAttacks = 3;
    pushSkillLog(
      s,
      "chronomancer",
      "미래 예지",
      "미래를 본다. 다음 3 공격 반드시 crit",
      "chrono_foresight_t3",
    );
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
  requires: ["chrono_stop_t3", "chrono_foresight_t3"],
  shouldFire: (s) =>
    s.hero.hp < s.hero.maxHp * 0.4 || s.time < s.maxTime * 0.3,
  apply(s) {
    s.hero.hp = s.hero.maxHp;
    s.time = Math.min(s.maxTime, s.time + 30);
    pushSkillLog(
      s,
      "chronomancer",
      "시간 역류",
      "HP 완전 회복 · 시간 +30",
      "chrono_reflux_t4",
    );
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
    pushSkillLog(
      s,
      "priest",
      "성스러운 빛",
      `HP 완전 회복 (+${healed})`,
      "priest_light_t1",
      { heal: healed },
    );
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
  branch: "a",
  requires: ["priest_light_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6,
  apply(s) {
    const heal = Math.round(40 * getIntMult(s));
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    s.heroDmgReductionRounds = { rounds: 3, reduction: 0.3 };
    pushSkillLog(
      s,
      "priest",
      "정화",
      `HP +${heal} · 3 round 피해 -30%`,
      "priest_purge_t2",
      { heal },
    );
  },
};

const priestT2b: ClassSkill = {
  id: "priest_favor_t2",
  class: "priest",
  tier: 2,
  name: "신의 가호",
  description: "1 round 무적.",
  resourceCost: 50,
  cooldown: 9,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["priest_light_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.4 && !s.heroInvulnerableRounds,
  apply(s) {
    s.heroInvulnerableRounds = 1;
    pushSkillLog(
      s,
      "priest",
      "신의 가호",
      "신의 가호가 내린다. 1 round 무적",
      "priest_favor_t2",
    );
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
  branch: "a",
  requires: ["priest_purge_t2", "priest_favor_t2"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.25 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `심판: ${m.name} 이 빛에 타들어간다, ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.priest_judgment_t3",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "priest",
      "심판",
      `적 HP 25% (${dmg})`,
      "priest_judgment_t3",
      { damage: dmg },
    );
  },
};

const priestT3b: ClassSkill = {
  id: "priest_bless_t3",
  class: "priest",
  tier: 3,
  name: "축복",
  description: "HP +60 회복 + 3 round 공격 +25%.",
  resourceCost: 60,
  cooldown: 7,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["priest_purge_t2", "priest_favor_t2"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.7 && !s.heroAtkBonusRounds,
  apply(s) {
    const heal = Math.round(60 * getIntMult(s));
    const healed = Math.min(s.hero.maxHp - s.hero.hp, heal);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    s.heroAtkBonusRounds = { rounds: 3, mult: 1.25 };
    pushSkillLog(
      s,
      "priest",
      "축복",
      `축복이 내린다. HP +${healed}, 3 round 공격 +25%`,
      "priest_bless_t3",
      { heal: healed },
    );
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
  requires: ["priest_judgment_t3", "priest_bless_t3"],
  // Phase 13 review Critical #3 — 이전 `!s.revivePending` 만 있어 풀 HP 에서도
  //   자원 차자마자 queue → T1 힐이 영원히 skip. 이제 HP 35% 이하 위험 상태에서만
  //   revive 준비 → 비위험 상황엔 T1 `성스러운 빛` (HP 20% 이하 완치) 이 자연
  //   발동 가능.
  shouldFire: (s) => !s.revivePending && s.hero.hp / s.hero.maxHp < 0.35,
  apply(s) {
    s.revivePending = true;
    pushSkillLog(
      s,
      "priest",
      "부활",
      "부활의 축복이 준비된다",
      "priest_revive_t4",
    );
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
    pushSkillLog(
      s,
      "illusionist",
      "환영",
      "환영: 다음 3 공격 miss",
      "illus_mirage_t1",
    );
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
  branch: "a",
  requires: ["illus_mirage_t1"],
  shouldFire: (s) => !s.heroAtkBonusRounds,
  apply(s) {
    s.heroAtkBonusRounds = { rounds: 2, mult: 2.0 };
    pushSkillLog(
      s,
      "illusionist",
      "분신",
      "2 round 공격 2배",
      "illus_double_t2",
    );
  },
};

const illusT2b: ClassSkill = {
  id: "illus_shadow_t2",
  class: "illusionist",
  tier: 2,
  name: "그림자 걸음",
  description: "2 round 회피 100%.",
  resourceCost: 50,
  cooldown: 7,
  requiredLevel: 35,
  pointCost: 1,
  branch: "b",
  requires: ["illus_mirage_t1"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5 && !s.forcedDodgeRounds,
  apply(s) {
    s.forcedDodgeRounds = 2;
    pushSkillLog(
      s,
      "illusionist",
      "그림자 걸음",
      "그림자 속으로 사라진다. 2 round 회피 100%",
      "illus_shadow_t2",
    );
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
  branch: "a",
  requires: ["illus_double_t2", "illus_shadow_t2"],
  shouldFire: (s, m) => !!m && m.hp > 0 && !s.enemyStunnedRounds,
  apply(s) {
    s.enemyStunnedRounds = 2;
    pushSkillLog(
      s,
      "illusionist",
      "환혹",
      "적이 홀려 움직이지 못한다: 2 round",
      "illus_charm_t3",
    );
  },
};

const illusT3b: ClassSkill = {
  id: "illus_burst_t3",
  class: "illusionist",
  tier: 3,
  name: "환상 폭발",
  description: "적 현재 HP 30% 피해.",
  resourceCost: 65,
  cooldown: 7,
  requiredLevel: 40,
  pointCost: 1,
  branch: "b",
  requires: ["illus_double_t2", "illus_shadow_t2"],
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s, m) {
    if (!m) return;
    const dmg = Math.round(m.hp * 0.3 * getIntMult(s));
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `환상이 ${m.name} 앞에서 폭발한다. ${dmg} 피해`,
      narrativeKey: "uphero.combat.narrative.skillHitMonster.illus_burst_t3",
      narrativeParams: {
        monster: m.name,
        monsterTemplateId: m.templateId ?? "",
        damage: dmg,
      },
      timestamp: Date.now(),
    });
    pushSkillLog(
      s,
      "illusionist",
      "환상 폭발",
      `환상이 폭발한다 (${dmg})`,
      "illus_burst_t3",
      { damage: dmg },
    );
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
  requires: ["illus_charm_t3", "illus_burst_t3"],
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.3,
  apply(s) {
    s.heroInvulnerableRounds = 3;
    pushSkillLog(
      s,
      "illusionist",
      "환몽",
      "영웅이 꿈 속으로: 3 round 무적",
      "illus_dreamscape_t4",
    );
  },
};

/* ────────────────────────────────────────────
 * Phase 14 — NOVICE 스킬 (전직 전 tutorial)
 *
 * 전직 (Lv30) 전까지 영웅은 class 가 없어 스킬 트리 자체를 사용하지 못했다.
 * 저레벨 전투가 '기본 공격만 반복' 이라 지루하고 skill 개념 학습 기회도 없다.
 *
 * 해결: 3 개의 가벼운 튜토리얼 스킬을 레벨별로 자동 지급.
 *  - novice_heal  (Lv1+): HP +15 회복 — "스킬 = 회복" 학습 (튜토리얼 입문).
 *  - novice_focus (Lv5+): 다음 공격 피해 +50% — "스킬 = 공격 강화" 학습.
 *  - novice_brace (Lv15+): 다음 1 round 피해 -50% — "스킬 = 방어" 학습.
 *
 * 자원 비용 0 (novice 는 클래스 자원 없음). 쿨다운 길게 (7/5/6 round) — 전직 후
 * 본격 스킬 트리 대비 DPS 기여도 제한.
 * ──────────────────────────────────────────── */

const noviceHeal: ClassSkill = {
  id: "novice_heal",
  class: "novice",
  tier: 0,
  name: "초급 힐링",
  description: "HP +15 회복.",
  resourceCost: 0,
  cooldown: 7,
  requiredLevel: 1,
  pointCost: 0,
  // auto 발동: HP 60% 이하일 때만. "거의 풀피인데 힐 써서 쿨 낭비" 방지.
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6,
  apply(s) {
    // 고정 15 — novice 는 INT scaling 없이 튜토리얼 난이도 유지.
    const heal = 15;
    const healed = Math.min(s.hero.maxHp - s.hero.hp, heal);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + heal);
    pushSkillLog(
      s,
      "novice",
      "초급 힐링",
      `HP +${healed}`,
      "novice_heal",
      { heal: healed },
    );
  },
};

const noviceFocus: ClassSkill = {
  id: "novice_focus",
  class: "novice",
  tier: 0,
  name: "집중 일격",
  description: "다음 공격 피해 +50%.",
  resourceCost: 0,
  cooldown: 5,
  requiredLevel: 5,
  pointCost: 0,
  shouldFire: (_s, m) => !!m && m.hp > 0,
  apply(s) {
    // 이미 nextHeroDamageMult 가 설정돼 있으면 (예: 다른 경로) 덮어쓰기 금지 — max.
    const prev = s.nextHeroDamageMult ?? 1;
    s.nextHeroDamageMult = Math.max(prev, 1.5);
    pushSkillLog(
      s,
      "novice",
      "집중 일격",
      "영웅이 깊게 호흡한다: 다음 공격 +50%.",
      "novice_focus",
    );
  },
};

const noviceBrace: ClassSkill = {
  id: "novice_brace",
  class: "novice",
  tier: 0,
  name: "방어 자세",
  description: "다음 1 round 받는 피해 -50%.",
  resourceCost: 0,
  cooldown: 6,
  requiredLevel: 15,
  pointCost: 0,
  shouldFire: (s, m) =>
    !!m && m.hp > 0 && s.hero.hp / s.hero.maxHp <= 0.5, // HP 50% 이하일 때만 auto
  apply(s) {
    // 1 round 동안 피해 -50%. 기존 heroDmgReductionRounds 가 강하면 유지.
    const prev = s.heroDmgReductionRounds;
    if (!prev || prev.reduction < 0.5 || prev.rounds < 1) {
      s.heroDmgReductionRounds = { rounds: 1, reduction: 0.5 };
    }
    pushSkillLog(
      s,
      "novice",
      "방어 자세",
      "영웅이 자세를 낮춘다: 다음 피해 -50%.",
      "novice_brace",
    );
  },
};

// 순서 = UI 렌더 순서. Lv1 힐 → Lv5 집중 → Lv15 방어 (해금 순).
export const NOVICE_SKILLS: ClassSkill[] = [noviceHeal, noviceFocus, noviceBrace];

/* ────────────────────────────────────────────
 * CLASS_SKILL_TREES — 각 클래스의 4 tier 스킬 배열
 * ──────────────────────────────────────────── */

export const CLASS_SKILL_TREES: Record<ClassType, ClassSkill[]> = {
  warrior: [warriorT1, warriorT2, warriorT2b, warriorT3, warriorT3b, warriorT4],
  mage: [mageT1, mageT2, mageT2b, mageT3, mageT3b, mageT4],
  monk: [monkT1, monkT2, monkT2b, monkT3, monkT3b, monkT4],
  druid: [druidT1, druidT2, druidT2b, druidT3, druidT3b, druidT4],
  bard: [bardT1, bardT2, bardT2b, bardT3, bardT3b, bardT4],
  chronomancer: [chronoT1, chronoT2, chronoT2b, chronoT3, chronoT3b, chronoT4],
  priest: [priestT1, priestT2, priestT2b, priestT3, priestT3b, priestT4],
  illusionist: [illusT1, illusT2, illusT2b, illusT3, illusT3b, illusT4],
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

/** 트리 tier 순서 (UI 렌더 순서). tier 2/3 은 2열, 1/4 는 1열. */
export const SKILL_TREE_TIERS = [1, 2, 3, 4] as const;

/**
 * Phase 3-F — 학습 판정 결과.
 *   ok       : 배울 수 있다
 *   learned  : 이미 배웠다
 *   class    : classType 이 없거나 다른 class 의 스킬
 *   level    : 영웅 레벨 부족
 *   requires : 선행 스킬(any-of) 미충족
 *   branch   : 같은 tier 의 형제 스킬을 이미 배웠다
 *   points   : 남은 SP 부족
 * iOS `ClassSkills.SkillLearnStatus.webName` 과 문자열이 같아야 한다 (동치 검증).
 */
export type SkillLearnStatus =
  | "ok"
  | "learned"
  | "class"
  | "level"
  | "requires"
  | "branch"
  | "points";

/** 같은 class·같은 tier 의 다른 branch 스킬. T1/T4/novice 는 null. */
export function getSiblingSkill(skill: ClassSkill): ClassSkill | null {
  if (skill.class === "novice" || !skill.branch) return null;
  const tree = CLASS_SKILL_TREES[skill.class];
  return (
    tree.find(
      (x) => x.tier === skill.tier && x.id !== skill.id && !!x.branch,
    ) ?? null
  );
}

/**
 * Phase 3-F — 단일 학습 규칙. 스토어 learnSkill 과 SkillTreePanel 이 같이 쓴다.
 *   검사 순서 고정: learned → class → level → requires → branch → points → ok.
 *   (이미 배운 스킬은 다른 이유보다 먼저 "learned", class 불일치는 level 보다 먼저.)
 */
export function getSkillLearnStatus(
  skill: ClassSkill,
  ctx: {
    classType: ClassType | null;
    heroLevel: number;
    learned: string[];
    points: number;
  },
): SkillLearnStatus {
  if (ctx.learned.includes(skill.id)) return "learned";
  if (!ctx.classType || skill.class !== ctx.classType) return "class";
  if (ctx.heroLevel < skill.requiredLevel) return "level";
  const req = skill.requires ?? [];
  if (req.length > 0 && !req.some((id) => ctx.learned.includes(id))) {
    return "requires";
  }
  const sibling = getSiblingSkill(skill);
  if (sibling && ctx.learned.includes(sibling.id)) return "branch";
  if (ctx.points < skill.pointCost) return "points";
  return "ok";
}

/** skillId → ClassSkill lookup (어느 트리에 속한지와 무관). */
export function findSkillById(id: string): ClassSkill | null {
  // Phase 14 — novice skill 먼저 검사 (id 충돌 없음, lookup 비용 ~2개).
  const nov = NOVICE_SKILLS.find((x) => x.id === id);
  if (nov) return nov;
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
  // Phase 12 i18n — skill apply 내부의 pushSkillLog 가 skillId 없이 로그를
  //   기록하므로, 여기서 마지막 "skill" entry 에 skillId 를 주입. CombatLog /
  //   DungeonView announce 가 translate 된 이름을 조회할 수 있게.
  for (let i = s.log.length - 1; i >= 0; i--) {
    const entry = s.log[i];
    if (entry.type !== "skill") break;
    if (!entry.skillId) {
      entry.skillId = skillId;
      break;
    }
    break;
  }
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
 *
 * Phase 3-F — 동 tier 타이브레이크 = CLASS_SKILL_TREES 선언 순서 (a 먼저, 그 다음 b).
 *   정상 저장본은 tier 당 최대 1개만 배우므로 충돌은 레거시/손상 데이터에서만 생긴다.
 *   Array.prototype.sort 는 안정 정렬(ES2019+)이라 비교자만 tier 로 두면 선언 순서가
 *   유지된다 — 비교자를 비안정 정렬로 바꾸지 말 것 (classSkills.test.ts 가 고정).
 *   iOS 는 (tier desc, offset asc) 정렬로 같은 결과를 낸다.
 */
export function maybeFireSkill(
  s: CombatSession,
  monster: Monster | null,
): void {
  if (s.hero.autoSkillEnabled === false) return;

  const learned = s.hero.learnedSkills ?? [];
  const cls = s.hero.classType;
  // Phase 14 — novice + class tree 통합 후보. class 미획득 (Lv<30) 이어도 novice
  //   스킬 만으로 fire 가능. 전직 후에는 class 트리 + novice 둘 다 후보이나,
  //   tier 내림차순 정렬로 class T4 > T3 > ... > novice (tier 0) 순서가 됨.
  const tree = cls ? CLASS_SKILL_TREES[cls] : [];
  const candidates = [...NOVICE_SKILLS, ...tree]
    .filter((sk) => learned.includes(sk.id))
    .sort((a, b) => b.tier - a.tier);
  if (candidates.length === 0) return;
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
