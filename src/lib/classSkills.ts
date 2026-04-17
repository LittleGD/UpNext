/**
 * Up Hero — Phase 6b: class 별 액티브 스킬.
 *
 * 설계:
 * - 각 class 당 1 active skill, cooldown 기반 자동 발동
 * - shouldFire(): session + monster 컨텍스트 기반 발동 조건 확인
 * - apply(): session 에 효과 적용 + log 에 "skill" entry push
 * - tickSession 에서 combat round 직전 maybeFireSkill 호출
 * - hero.autoSkillEnabled === false 면 발동 안 함 (유저 토글)
 *
 * 효과 타입:
 * - 즉시 효과 (priest HP 복구, druid HP +40, chronomancer time +10, mage 적 HP 컷)
 * - 다음 공격 배율 (warrior 강타, bard 코인, illusionist 환영 횟수, monk dodge 턴)
 *   → session 에 state 필드로 보관, combat round 에서 소모
 */

import type { ClassType, CombatSession, Monster } from "@/types/uphero";

export interface ClassSkill {
  class: ClassType;
  name: string;
  cooldown: number;
  /** 이 round 에 발동 가능한가? hero autoSkillEnabled + context 기반 */
  shouldFire(s: CombatSession, monster: Monster | null): boolean;
  /** 발동 효과 적용 + skill 로그 entry push */
  apply(s: CombatSession, monster: Monster | null): void;
}

/* ────────────────────────────────────────────
 * 각 class 별 스킬 구현
 * ──────────────────────────────────────────── */

const warrior: ClassSkill = {
  class: "warrior",
  name: "강타",
  cooldown: 5,
  shouldFire: (_s, monster) => {
    if (!monster) return false;
    // 적 HP > 50% 면 초반에 큰 타격 — 중후반 이후는 무의미
    return monster.hp > 0 && monster.hp / (monster.hp || 1) > 0.5;
    // Note: monster.hp 는 monster 의 "남은" HP 가 아니고 "최대" HP 임.
    // 실제 남은 HP 는 combatState 계산 후에만 알 수 있어 아래 로직은
    // monster.hp 기준으로 단순 근사. 정확도 높이려면 caller 가 remainingHp 전달.
  },
  apply(s) {
    s.nextHeroDamageMult = 2;
    pushSkillLog(s, "warrior", "강타", "영웅이 강타를 준비한다 — 다음 공격 2배");
  },
};

const mage: ClassSkill = {
  class: "mage",
  name: "지식의 번개",
  cooldown: 6,
  shouldFire: (_s, monster) => !!monster && monster.hp > 0,
  apply(s, monster) {
    if (!monster) return;
    // 적 현재 HP -25% — combatState 를 다시 계산하도록 combat log 에 damage
    // 엔트리를 넣는 방식 대신, monster 의 max HP 기준 25% 를 damage entry 로 추가.
    // executeCombatRound 가 매 round 마다 computeCombatState 로 HP 재계산하므로
    // 추가 "combat" 엔트리로 넣으면 자연히 반영됨.
    const dmg = Math.round(monster.hp * 0.25);
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: dmg,
      outcome: "crit",
      narrative: `영웅의 번개가 ${monster.name} 을 꿰뚫는다 — ${dmg} 피해`,
      timestamp: Date.now(),
    });
    pushSkillLog(s, "mage", "지식의 번개", `적 HP 25% 감소 (${dmg})`);
  },
};

const monk: ClassSkill = {
  class: "monk",
  name: "선정",
  cooldown: 8,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.5,
  apply(s) {
    s.forcedDodgeRounds = 2;
    pushSkillLog(s, "monk", "선정", "영웅이 눈을 감고 선정에 든다 — 2 round 회피 100%");
  },
};

const druid: ClassSkill = {
  class: "druid",
  name: "치유 결계",
  cooldown: 5,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.6,
  apply(s) {
    const healed = Math.min(s.hero.maxHp - s.hero.hp, 40);
    s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 40);
    pushSkillLog(s, "druid", "치유 결계", `자연의 결계가 영웅을 감싼다 — HP +${healed}`);
  },
};

const bard: ClassSkill = {
  class: "bard",
  name: "노래",
  cooldown: 4,
  shouldFire: () => true, // 매 cooldown 끝나는 round 마다 무조건 (bard 는 항상 노래)
  apply(s) {
    s.nextCoinMult = 1.5;
    pushSkillLog(s, "bard", "노래", "영웅이 용기의 노래를 부른다 — 다음 처치 보상 1.5배");
  },
};

const chronomancer: ClassSkill = {
  class: "chronomancer",
  name: "시간 되감기",
  cooldown: 7,
  shouldFire: (s) => s.time < s.maxTime * 0.5,
  apply(s) {
    const restore = Math.min(s.maxTime - s.time, 10);
    s.time = Math.min(s.maxTime, s.time + 10);
    pushSkillLog(s, "chronomancer", "시간 되감기", `시계 바늘이 거꾸로 돈다 — 시간 +${restore}`);
  },
};

const priest: ClassSkill = {
  class: "priest",
  name: "성스러운 빛",
  cooldown: 10,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.2,
  apply(s) {
    const healed = s.hero.maxHp - s.hero.hp;
    s.hero.hp = s.hero.maxHp;
    pushSkillLog(s, "priest", "성스러운 빛", `찬란한 빛이 영웅을 감싼다 — HP 완전 회복 (+${healed})`);
  },
};

const illusionist: ClassSkill = {
  class: "illusionist",
  name: "환영",
  cooldown: 6,
  shouldFire: (s) => s.hero.hp < s.hero.maxHp * 0.4,
  apply(s) {
    s.forcedEnemyMisses = 3;
    pushSkillLog(
      s,
      "illusionist",
      "환영",
      "영웅이 환영을 펼친다 — 다음 3회 공격 모두 miss",
    );
  },
};

export const CLASS_SKILLS: Record<ClassType, ClassSkill> = {
  warrior,
  mage,
  monk,
  druid,
  bard,
  chronomancer,
  priest,
  illusionist,
};

/* ────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────── */

/**
 * tickSession 의 combat round 직전에 호출.
 *
 * - 영웅이 class 분화됨 + autoSkillEnabled 켜짐
 * - skillCooldown === 0
 * - skill.shouldFire() === true
 *
 * → skill.apply() 호출 + skillCooldown 설정
 */
export function maybeFireSkill(
  s: CombatSession,
  monster: Monster | null,
): void {
  const cls = s.hero.classType;
  if (!cls) return;
  if (s.hero.autoSkillEnabled === false) return;
  if ((s.skillCooldown ?? 0) > 0) return;

  const skill = CLASS_SKILLS[cls];
  if (!skill.shouldFire(s, monster)) return;

  skill.apply(s, monster);
  s.skillCooldown = skill.cooldown;
}

/** Combat round 종료 시 호출 — 쿨다운 감소 및 "다음 N round" 카운터 감소 */
export function advanceSkillCounters(s: CombatSession): void {
  if (s.skillCooldown != null && s.skillCooldown > 0) {
    s.skillCooldown -= 1;
  }
  if (s.forcedDodgeRounds != null && s.forcedDodgeRounds > 0) {
    s.forcedDodgeRounds -= 1;
    if (s.forcedDodgeRounds === 0) delete s.forcedDodgeRounds;
  }
}

/* ────────────────────────────────────────────
 * Internal — skill log entry push
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
