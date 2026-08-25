import type {
  RewardDefinition,
  SkillEffectId,
  CurseEffectId,
} from "@/types/minigame";

/**
 * 미니게임 정적 데이터 — 보상/스킬/저주 정의.
 * ChallengeCard와 분리: 콜렉션 오염 방지, Firestore 스키마 격리.
 */

// === 스킬 정의 ===
// 라운드 시작 시 스킬 쌍마다 하나씩 랜덤 배정됨 (라운드 2에는 1종, 라운드 3에는 2종)
export interface SkillDefinition {
  id: SkillEffectId;
  nameKey: string;    // i18n key (minigame.skill.*.name)
  descKey: string;    // i18n key (minigame.skill.*.desc)
  iconName: string;   // PixelIcon 이름
}

export const SKILL_DEFINITIONS: Record<SkillEffectId, SkillDefinition> = {
  chancesPlus2: {
    id: "chancesPlus2",
    nameKey: "minigame.skill.chancesPlus2.name",
    descKey: "minigame.skill.chancesPlus2.desc",
    iconName: "Clock",
  },
  peek2: {
    id: "peek2",
    nameKey: "minigame.skill.peek2.name",
    descKey: "minigame.skill.peek2.desc",
    iconName: "Eye",
  },
  mulligan: {
    id: "mulligan",
    nameKey: "minigame.skill.mulligan.name",
    descKey: "minigame.skill.mulligan.desc",
    iconName: "Reload",
  },
  compass: {
    id: "compass",
    nameKey: "minigame.skill.compass.name",
    descKey: "minigame.skill.compass.desc",
    iconName: "MapPin",
  },
};

// 실제로 랜덤 뽑기에 사용할 수 있는 스킬 ID 리스트
export const ALL_SKILL_IDS: SkillEffectId[] = [
  "chancesPlus2",
  "peek2",
  "mulligan",
  "compass",
];

// === 저주 정의 ===
export interface CurseDefinition {
  id: CurseEffectId;
  nameKey: string;
  descKey: string;
  iconName: string;
}

export const CURSE_DEFINITIONS: Record<CurseEffectId, CurseDefinition> = {
  loseChanceAndStripBuff: {
    id: "loseChanceAndStripBuff",
    nameKey: "minigame.curse.triggered",
    descKey: "minigame.curse.buffStripped",
    iconName: "WarningDiamond",
  },
};

// === 보상 풀 (10종) ===
// 라운드 종료 후 이 풀에서 tier 가중치 반영해 3개 랜덤 뽑음
// tier는 메인 앱 rarity 체계와 통합: rare → unique → legend
// 가중치: rare × 3 / unique × 2 / legend × 1
// 구성: rare 4종 / unique 5종 / legend 1종
export const REWARD_POOL: RewardDefinition[] = [
  {
    id: "steelNerves",
    tier: "rare",
    nameKey: "minigame.reward.steelNerves.name",
    descKey: "minigame.reward.steelNerves.desc",
    scope: "round",
  },
  {
    id: "rareSurge",
    tier: "rare",
    nameKey: "minigame.reward.rareSurge.name",
    descKey: "minigame.reward.rareSurge.desc",
    scope: "round",
  },
  {
    id: "wideEye",
    tier: "rare",
    nameKey: "minigame.reward.wideEye.name",
    descKey: "minigame.reward.wideEye.desc",
    scope: "round",
  },
  {
    id: "firstHarvest",
    tier: "rare",
    nameKey: "minigame.reward.firstHarvest.name",
    descKey: "minigame.reward.firstHarvest.desc",
    scope: "round",
  },
  {
    id: "duplicateStash",
    tier: "unique",
    nameKey: "minigame.reward.duplicateStash.name",
    descKey: "minigame.reward.duplicateStash.desc",
    scope: "run",
  },
  {
    id: "warded",
    tier: "unique",
    nameKey: "minigame.reward.warded.name",
    descKey: "minigame.reward.warded.desc",
    scope: "round",
  },
  {
    id: "appraisal",
    tier: "unique",
    nameKey: "minigame.reward.appraisal.name",
    descKey: "minigame.reward.appraisal.desc",
    scope: "run",
  },
  {
    id: "chainAwaken",
    tier: "unique",
    nameKey: "minigame.reward.chainAwaken.name",
    descKey: "minigame.reward.chainAwaken.desc",
    scope: "round",
  },
  {
    id: "xpBloom",
    tier: "unique",
    nameKey: "minigame.reward.xpBloom.name",
    descKey: "minigame.reward.xpBloom.desc",
    scope: "round",
  },
  {
    id: "doubleLoot",
    tier: "legend",
    nameKey: "minigame.reward.doubleLoot.name",
    descKey: "minigame.reward.doubleLoot.desc",
    scope: "run",
  },
];

// tier별 가중치 — rewardDraft 샘플링에서 사용
export const REWARD_TIER_WEIGHT: Record<RewardDefinition["tier"], number> = {
  rare: 3,
  unique: 2,
  legend: 1,
};

/**
 * REWARD_POOL에서 가중치 기반으로 N개 뽑기 (replacement 없음).
 * 같은 보상이 2번 제안되지 않도록 pickedIds 제외.
 */
export function drawRewardOffer(count: number, rng: () => number = Math.random): RewardDefinition[] {
  const pool = [...REWARD_POOL];
  const picked: RewardDefinition[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const weights = pool.map((r) => REWARD_TIER_WEIGHT[r.tier]);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng() * totalWeight;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      roll -= weights[j];
      if (roll <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return picked;
}

/**
 * 스킬 ID N개를 랜덤 뽑기 (replacement 없음 — 같은 라운드 내 중복 방지).
 * N > 4면 4개까지만 반환 (스킬 종류 수).
 */
export function drawSkillIds(count: number, rng: () => number = Math.random): SkillEffectId[] {
  const pool = [...ALL_SKILL_IDS];
  const picked: SkillEffectId[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}
