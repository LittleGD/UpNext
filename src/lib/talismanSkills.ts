/**
 * Up Hero — Phase 11b: 사진 부적 passive skill 시스템.
 *
 * 사용자가 같은 photo 를 여러 번 "의식" 하여 부적을 +5 / +10 강화하면
 * category (원본 photo 의 challenge category) 기반 passive 스킬이 부여된다.
 * 스탯 상승은 미미하고 **스킬이 주 보상** — 수집/반복 의식의 동기 부여.
 *
 * 설계:
 *   - 8 category × 2 tier (+5 / +10) = 16 skill.
 *   - 각 skill 은 세션 시작 시 `TalismanModifiers` 에 누적 (대부분 passive modifier).
 *   - 일부 (강단=counter, 불굴=low-HP power, 무념=round agi stack) 는 round 기반.
 *   - 밸런스 원칙: class passive (warrior HP+2, mage XP×1.2 등) 의 **half 수준**.
 *     부적 4 슬롯 합산해도 "강함 +40%" 선에서 수렴.
 *
 * 호출처:
 *   - `createSession` → `collectTalismanSkills` → `TalismanModifiers` 반환 → session 에 저장.
 *   - `executeCombatRound` → round 기반 skill (counter, low-HP, agi accum) 처리.
 *   - 개별 trigger (coin 지급, time 소모, heal, drop 확률 등) 는 해당 지점에서
 *     `session.talismanMods` 참조해 값을 곱/합.
 */

import type {
  CombatSession,
  DungeonId,
  Equipment,
  Hero,
} from "@/types/uphero";

/* ══════════════════════════════════════════════════════════════════════
 * Modifier 누적 버킷 — 세션 시작 시 계산 후 session.talismanMods 에 저장.
 * 개별 필드는 combat/time/drop 각 지점에서 참조.
 * ══════════════════════════════════════════════════════════════════════ */

export interface TalismanModifiers {
  /** 회피 추가 확률 (0-1). monk dodgeBonus 와 합산. */
  dodgeBonus: number;
  /** 적 공격 miss 추가 확률 (0-1). */
  enemyMissBonus: number;
  /** crit damage 배율 추가. 0.15 면 crit 데미지 +15%. */
  critDmgBonus: number;
  /** coin 보상 곱. 1.1 이면 +10%. 여러 부적 가산시 곱해짐 (1.1 × 1.0 = 1.1). */
  coinMult: number;
  /** time 소모 곱. 0.95 면 -5% 소모. chronomancer 0.75 와 곱해짐. */
  timeCostMult: number;
  /** heal 효과 곱 (choice heal effect). 1.25 면 +25%. */
  healEffectMult: number;
  /** 2 round 마다 +N HP regen. (warrior regen +2/round 와 별개. stack 가능). */
  hpRegenEvery2Rounds: number;
  /** 세션 중 1회 발동될 "보너스 랜덤 드롭" 확률 (0-1). 세션당 최대 1회. */
  extraDropChance: number;
  /** 드롭 rarity roll 에서 legend 확률에 가산되는 퍼센트 포인트 (0.02 = +2%). */
  legendDropBonus: number;
  /** boss 처치 시 time 회복량 (+N). */
  bossTimeRecover: number;
  /** 피격 시 counter-attack 발동 확률 (0-1). counter damage = +1 고정. */
  counterChance: number;
  /** HP ≤ 20% 일 때 영웅 공격 배율 가산. 0.25 면 데미지 +25%. */
  lowHpDmgBonus: number;
  /** round 당 agi 누적치. +1/round cap +8 형태로 사용. */
  agiRoundAccum: number;
  /** agi 누적 상한. */
  agiRoundCap: number;
  /** class skill cooldown 감소 (정수). -1 이면 CD 1 줄임. */
  classSkillCdReduce: number;
  /** 세션 start 에 즉시 더해질 XP. */
  startXp: number;
  /** 세션 start HP 에 곱해지는 배율. 1.10 이면 110%. */
  startHpMult: number;
  /** 세션 start HP 에 더해지는 고정값. maxHp 도 같이 증가. */
  startHpFlat: number;
}

/** 기본 modifier — 부적 스킬 0개인 영웅용 */
export function emptyTalismanMods(): TalismanModifiers {
  return {
    dodgeBonus: 0,
    enemyMissBonus: 0,
    critDmgBonus: 0,
    coinMult: 1,
    timeCostMult: 1,
    healEffectMult: 1,
    hpRegenEvery2Rounds: 0,
    extraDropChance: 0,
    legendDropBonus: 0,
    bossTimeRecover: 0,
    counterChance: 0,
    lowHpDmgBonus: 0,
    agiRoundAccum: 0,
    agiRoundCap: 0,
    classSkillCdReduce: 0,
    startXp: 0,
    startHpMult: 1,
    startHpFlat: 0,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * Skill 카탈로그 — 16개.
 * id = `{category}_{tier}`, tier 5 / 10.
 * apply(m): modifier 에 누적 가산 (pure — m 복사 없이 직접 mutate).
 * ══════════════════════════════════════════════════════════════════════ */

export interface TalismanSkill {
  id: string;
  category: DungeonId;
  tier: 5 | 10;
  name: string;
  description: string;
  apply(m: TalismanModifiers): void;
}

/** skill id 리스트. Equipment.talismanSkills 에 저장될 값들. */
export const TALISMAN_SKILL_IDS = {
  // fitness
  fit5: "fit_5",
  fit10: "fit_10",
  // learning
  lrn5: "lrn_5",
  lrn10: "lrn_10",
  // mindfulness
  mnd5: "mnd_5",
  mnd10: "mnd_10",
  // nutrition
  ntr5: "ntr_5",
  ntr10: "ntr_10",
  // social
  soc5: "soc_5",
  soc10: "soc_10",
  // productivity
  prd5: "prd_5",
  prd10: "prd_10",
  // wellness
  wel5: "wel_5",
  wel10: "wel_10",
  // trending
  trd5: "trd_5",
  trd10: "trd_10",
} as const;

/** 카테고리 → [tier5 id, tier10 id] 맵. rebind 시 부여할 skill 결정에 쓰임. */
export const CATEGORY_TO_SKILLS: Record<DungeonId, [string, string]> = {
  fitness: [TALISMAN_SKILL_IDS.fit5, TALISMAN_SKILL_IDS.fit10],
  learning: [TALISMAN_SKILL_IDS.lrn5, TALISMAN_SKILL_IDS.lrn10],
  mindfulness: [TALISMAN_SKILL_IDS.mnd5, TALISMAN_SKILL_IDS.mnd10],
  nutrition: [TALISMAN_SKILL_IDS.ntr5, TALISMAN_SKILL_IDS.ntr10],
  social: [TALISMAN_SKILL_IDS.soc5, TALISMAN_SKILL_IDS.soc10],
  productivity: [TALISMAN_SKILL_IDS.prd5, TALISMAN_SKILL_IDS.prd10],
  wellness: [TALISMAN_SKILL_IDS.wel5, TALISMAN_SKILL_IDS.wel10],
  trending: [TALISMAN_SKILL_IDS.trd5, TALISMAN_SKILL_IDS.trd10],
};

export const TALISMAN_SKILLS: Record<string, TalismanSkill> = {
  [TALISMAN_SKILL_IDS.fit5]: {
    id: TALISMAN_SKILL_IDS.fit5,
    category: "fitness",
    tier: 5,
    name: "강단",
    description: "피격 시 15% 확률로 반격 +1 데미지",
    apply(m) {
      m.counterChance += 0.15;
    },
  },
  [TALISMAN_SKILL_IDS.fit10]: {
    id: TALISMAN_SKILL_IDS.fit10,
    category: "fitness",
    tier: 10,
    name: "불굴",
    description: "HP 20% 이하 공격 +25%",
    apply(m) {
      m.lowHpDmgBonus += 0.25;
    },
  },

  [TALISMAN_SKILL_IDS.lrn5]: {
    id: TALISMAN_SKILL_IDS.lrn5,
    category: "learning",
    tier: 5,
    name: "통찰",
    description: "세션 시작 시 +15 XP",
    apply(m) {
      m.startXp += 15;
    },
  },
  [TALISMAN_SKILL_IDS.lrn10]: {
    id: TALISMAN_SKILL_IDS.lrn10,
    category: "learning",
    tier: 10,
    name: "현자",
    description: "치명타 피해 +15%",
    apply(m) {
      m.critDmgBonus += 0.15;
    },
  },

  [TALISMAN_SKILL_IDS.mnd5]: {
    id: TALISMAN_SKILL_IDS.mnd5,
    category: "mindfulness",
    tier: 5,
    name: "평정",
    description: "클래스 스킬 쿨다운 -1",
    apply(m) {
      m.classSkillCdReduce += 1;
    },
  },
  [TALISMAN_SKILL_IDS.mnd10]: {
    id: TALISMAN_SKILL_IDS.mnd10,
    category: "mindfulness",
    tier: 10,
    name: "무념",
    description: "round 당 agi +1 (최대 +8)",
    apply(m) {
      m.agiRoundAccum += 1;
      m.agiRoundCap = Math.max(m.agiRoundCap, 8);
    },
  },

  [TALISMAN_SKILL_IDS.ntr5]: {
    id: TALISMAN_SKILL_IDS.ntr5,
    category: "nutrition",
    tier: 5,
    name: "포만",
    description: "세션 시작 HP +20",
    apply(m) {
      m.startHpFlat += 20;
    },
  },
  [TALISMAN_SKILL_IDS.ntr10]: {
    id: TALISMAN_SKILL_IDS.ntr10,
    category: "nutrition",
    tier: 10,
    name: "대지의 축복",
    description: "2 round 마다 HP +1",
    apply(m) {
      m.hpRegenEvery2Rounds += 1;
    },
  },

  [TALISMAN_SKILL_IDS.soc5]: {
    id: TALISMAN_SKILL_IDS.soc5,
    category: "social",
    tier: 5,
    name: "카리스마",
    description: "코인 보상 +10%",
    apply(m) {
      m.coinMult *= 1.1;
    },
  },
  [TALISMAN_SKILL_IDS.soc10]: {
    id: TALISMAN_SKILL_IDS.soc10,
    category: "social",
    tier: 10,
    name: "군중의 총애",
    description: "세션 중 25% 확률로 랜덤 드롭 1회 추가",
    apply(m) {
      m.extraDropChance = Math.max(m.extraDropChance, 0.25);
    },
  },

  [TALISMAN_SKILL_IDS.prd5]: {
    id: TALISMAN_SKILL_IDS.prd5,
    category: "productivity",
    tier: 5,
    name: "절약",
    description: "시간 소모 -5%",
    apply(m) {
      m.timeCostMult *= 0.95;
    },
  },
  [TALISMAN_SKILL_IDS.prd10]: {
    id: TALISMAN_SKILL_IDS.prd10,
    category: "productivity",
    tier: 10,
    name: "시간 도둑",
    description: "보스 처치 시 시간 +10",
    apply(m) {
      m.bossTimeRecover += 10;
    },
  },

  [TALISMAN_SKILL_IDS.wel5]: {
    id: TALISMAN_SKILL_IDS.wel5,
    category: "wellness",
    tier: 5,
    name: "회복력",
    description: "회복 효과 +25%",
    apply(m) {
      m.healEffectMult *= 1.25;
    },
  },
  [TALISMAN_SKILL_IDS.wel10]: {
    id: TALISMAN_SKILL_IDS.wel10,
    category: "wellness",
    tier: 10,
    name: "안식",
    description: "세션 시작 HP 110%",
    apply(m) {
      m.startHpMult *= 1.1;
    },
  },

  [TALISMAN_SKILL_IDS.trd5]: {
    id: TALISMAN_SKILL_IDS.trd5,
    category: "trending",
    tier: 5,
    name: "변덕",
    description: "회피 +5%, 적 빗맞힘 +5%",
    apply(m) {
      m.dodgeBonus += 0.05;
      m.enemyMissBonus += 0.05;
    },
  },
  [TALISMAN_SKILL_IDS.trd10]: {
    id: TALISMAN_SKILL_IDS.trd10,
    category: "trending",
    tier: 10,
    name: "유행",
    description: "레전드 드롭 확률 +2%p",
    apply(m) {
      m.legendDropBonus += 0.02;
    },
  },
};

/* ══════════════════════════════════════════════════════════════════════
 * 공용 헬퍼
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 사진 부적의 enhanceLevel 에 따라 부여될 skill id 목록 계산.
 *   +5 이상 → tier5 skill 부여
 *   +10 이상 → tier10 skill 추가 부여 (총 2개)
 *   그 외 → 빈 배열.
 */
export function computeTalismanSkillIds(
  category: DungeonId,
  enhanceLevel: number,
): string[] {
  const [tier5Id, tier10Id] = CATEGORY_TO_SKILLS[category];
  const ids: string[] = [];
  if (enhanceLevel >= 5) ids.push(tier5Id);
  if (enhanceLevel >= 10) ids.push(tier10Id);
  return ids;
}

/**
 * 영웅의 장착된 모든 부적에서 talisman skill 을 수집 → modifiers 합산.
 * talisman 슬롯 뿐 아니라 혹시 accessory 등 다른 슬롯에서도 skills 가 있다면
 * 포함 (미래 확장 대비). 단 현재는 photo 부적만 skills 를 가짐.
 */
export function collectTalismanMods(hero: Hero): TalismanModifiers {
  const mods = emptyTalismanMods();
  const equipped = hero.equipped;
  for (const slot of Object.keys(equipped) as Array<keyof typeof equipped>) {
    const eq = equipped[slot];
    if (!eq) continue;
    const ids = (eq as Equipment).talismanSkills;
    if (!ids || ids.length === 0) continue;
    for (const id of ids) {
      const skill = TALISMAN_SKILLS[id];
      if (skill) skill.apply(mods);
    }
  }
  return mods;
}

/**
 * session 시작 시 즉시 적용되는 talisman 효과 — HP scale, HP flat, XP.
 * session 과 hero 를 모두 mutate.
 *   - startHpMult: 110% 면 maxHp *= 1.1, hp 도 새 maxHp 로.
 *   - startHpFlat: +20 이면 maxHp += 20, hp += 20.
 *   - startXp: session.rewards.xp 에 즉시 더함 (endSession 에서 함께 지급).
 */
export function applyTalismanSkillStartEffects(
  session: CombatSession,
  mods: TalismanModifiers,
): void {
  if (mods.startHpMult !== 1) {
    session.hero.maxHp = Math.round(session.hero.maxHp * mods.startHpMult);
    session.hero.hp = session.hero.maxHp;
  }
  if (mods.startHpFlat > 0) {
    session.hero.maxHp += mods.startHpFlat;
    session.hero.hp += mods.startHpFlat;
  }
  if (mods.startXp > 0) {
    session.rewards.xp += mods.startXp;
  }
}
