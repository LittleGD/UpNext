/**
 * Up Hero — Phase 4b: 카드 뒷면 버프 시스템.
 *
 * 버프 해결 전략 (런타임):
 *  - normal : 카테고리별 공통 템플릿 (8개)
 *  - rare   : auto-gen — 카테고리 normal × 1.5 스케일 + 특수효과 1개
 *  - unique : auto-gen — 카테고리 normal × 2 스케일 + 특수효과 or 카테고리 친화
 *  - legend : 23개 개별 커스텀 (LEGEND_BUFFS)
 *
 * 각 ChallengeCard 에 `buff` 필드를 직접 저장하지 않고,
 * `getCardBuff(card)` 로 런타임 resolve 하여 카드 데이터 파일을 깔끔히 유지.
 */

import type { Category, ChallengeCard } from "@/types/card";
import type { CardBuff, DungeonId } from "@/types/uphero";

// ─────────────────────────────────────────────────────────
// 밸런스 상수 (Phase 4b.1b)
// 친화 multiplier 는 2 → 1.3 으로 축소해 4-슬롯 인플레이션 방지.
// ─────────────────────────────────────────────────────────

/** 친화 multiplier — 같은 카테고리 던전에서 해당 카드 스탯을 1.3배로 반영 */
const AFFINITY_MULTIPLIER = 1.3;

/** 친화 multiplier 표시용 라벨 (description 일관성) */
const AFFINITY_LABEL = "1.3배";

// ─────────────────────────────────────────────────────────
// NORMAL — 카테고리별 공통 템플릿 (스탯만)
// ─────────────────────────────────────────────────────────

const NORMAL_BUFFS: Record<Category, CardBuff> = {
  fitness: {
    effects: [{ kind: "stat", stats: { str: 3 } }],
    description: "STR +3",
  },
  learning: {
    effects: [{ kind: "stat", stats: { int: 3 } }],
    description: "INT +3",
  },
  mindfulness: {
    effects: [{ kind: "stat", stats: { agi: 2, vit: 2 } }],
    description: "AGI +2 · VIT +2",
  },
  nutrition: {
    effects: [{ kind: "stat", stats: { vit: 4 } }],
    description: "VIT +4",
  },
  social: {
    effects: [{ kind: "stat", stats: { agi: 3 } }],
    description: "AGI +3",
  },
  productivity: {
    effects: [{ kind: "stat", stats: { dex: 3 } }],
    description: "DEX +3",
  },
  wellness: {
    effects: [
      { kind: "stat", stats: { vit: 2 } },
      { kind: "special", type: "healStart", value: 20 },
    ],
    description: "VIT +2 · 시작 HP +20",
  },
  trending: {
    effects: [{ kind: "stat", stats: { crit: 2 } }],
    description: "CRIT +2%",
  },
};

// ─────────────────────────────────────────────────────────
// LEGEND — 23개 개별 커스텀 (카드 이름의 의미를 살린 개성 버프)
// ─────────────────────────────────────────────────────────

/**
 * LEGEND_BUFFS — Phase 4b.1b 밸런스 조정 버전.
 *
 * 조정 원칙:
 *  - 스탯 합 평균 ~15 → ~10 (33% 다운)
 *  - 친화 multiplier 2 → 1.3 (35% 다운, 4 slot 중첩 시에도 적정)
 *  - Special effect value 전반 -30% (xpBoost 40→25, healStart 70→45 등)
 *
 * 카드별 개성은 유지: 각 legend 의 테마 (지구력/정복/회복/절대집중 등) 반영.
 */
const LEGEND_BUFFS: Record<string, CardBuff> = {
  // === 운동 3종 — 지구력, 정복, 유연함 ===
  "fitness-008": {
    // 5km 러닝 — 장거리 러너의 지구력 (~10 합)
    effects: [
      { kind: "stat", stats: { str: 6, vit: 3 } },
      { kind: "affinity", category: "fitness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `STR +6 · VIT +3 · 운동 던전 ${AFFINITY_LABEL}`,
  },
  "fitness-023": {
    // 등산 1시간 — 정복자의 걸음 (~12 합, 최상위)
    effects: [
      { kind: "stat", stats: { str: 7, vit: 5 } },
      { kind: "affinity", category: "fitness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `STR +7 · VIT +5 · 운동 던전 ${AFFINITY_LABEL}`,
  },
  "fitness-033": {
    // 수영 30분 — 유연한 강함 (~11 합, 3종 효과)
    effects: [
      { kind: "stat", stats: { str: 5, agi: 4, crit: 2 } },
      { kind: "affinity", category: "fitness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `STR +5 · AGI +4 · CRIT +2% · 운동 던전 ${AFFINITY_LABEL}`,
  },

  // === 식단 3종 — 정성, 회복, 준비 ===
  "nutrition-006": {
    // 간식 대신 견과류 — 현명한 선택 (~9 합)
    effects: [
      { kind: "stat", stats: { vit: 5, crit: 2 } },
      { kind: "affinity", category: "nutrition", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +5 · CRIT +2% · 식단 던전 ${AFFINITY_LABEL}`,
  },
  "nutrition-023": {
    // 건강 도시락 만들기 — 정성의 한 끼 (VIT+5, healStart 25)
    effects: [
      { kind: "stat", stats: { vit: 5 } },
      { kind: "special", type: "healStart", value: 25 },
      { kind: "affinity", category: "nutrition", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +5 · 시작 HP +25 · 식단 던전 ${AFFINITY_LABEL}`,
  },
  "nutrition-033": {
    // 주간 식단 미리 준비 — 준비된 자의 여유 (VIT+6, coin 15%)
    effects: [
      { kind: "stat", stats: { vit: 6 } },
      { kind: "special", type: "coinBoost", value: 15 },
      { kind: "affinity", category: "nutrition", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +6 · 코인 +15% · 식단 던전 ${AFFINITY_LABEL}`,
  },

  // === 명상 3종 — 자연, 침묵, 단절 ===
  "mindfulness-005": {
    // 자연 속 산책 — 자연의 지혜 (~7 합)
    effects: [
      { kind: "stat", stats: { agi: 4, vit: 3 } },
      { kind: "affinity", category: "mindfulness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `AGI +4 · VIT +3 · 명상 던전 ${AFFINITY_LABEL}`,
  },
  "mindfulness-023": {
    // 디지털 디톡스 하루 — 고요의 힘 (~8 합 + monster -12%)
    effects: [
      { kind: "stat", stats: { agi: 5, dex: 3 } },
      { kind: "special", type: "monsterFrequency", value: -12 },
      { kind: "affinity", category: "mindfulness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `AGI +5 · DEX +3 · 몬스터 조우 -12% · 명상 던전 ${AFFINITY_LABEL}`,
  },
  "mindfulness-033": {
    // 반나절 침묵 시간 — 침묵의 각성 (~10 합)
    effects: [
      { kind: "stat", stats: { agi: 7, int: 3 } },
      { kind: "affinity", category: "mindfulness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `AGI +7 · INT +3 · 명상 던전 ${AFFINITY_LABEL}`,
  },

  // === 학습 3종 — 넓은 시야, 지혜, 사유 ===
  "learning-006": {
    // 다큐멘터리 보기 — 넓은 시야 (INT+5, xp 17%)
    effects: [
      { kind: "stat", stats: { int: 5 } },
      { kind: "special", type: "xpBoost", value: 17 },
      { kind: "affinity", category: "learning", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `INT +5 · XP +17% · 학습 던전 ${AFFINITY_LABEL}`,
  },
  "learning-023": {
    // 독서 1시간 — 지혜의 문 (INT+7, xp 20%)
    effects: [
      { kind: "stat", stats: { int: 7 } },
      { kind: "special", type: "xpBoost", value: 20 },
      { kind: "affinity", category: "learning", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `INT +7 · XP +20% · 학습 던전 ${AFFINITY_LABEL}`,
  },
  "learning-033": {
    // 한 주제로 글 한 편 쓰기 — 사유의 완성 (INT+8, drop 10%)
    effects: [
      { kind: "stat", stats: { int: 8 } },
      { kind: "special", type: "dropRate", value: 10 },
      { kind: "affinity", category: "learning", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `INT +8 · 드롭 +10% · 학습 던전 ${AFFINITY_LABEL}`,
  },

  // === 소통 3종 — 진심, 품, 연결 ===
  "social-005": {
    // 손편지 쓰기 — 정성 담긴 연결 (AGI+4, coin 14%)
    effects: [
      { kind: "stat", stats: { agi: 4 } },
      { kind: "special", type: "coinBoost", value: 14 },
      { kind: "affinity", category: "social", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `AGI +4 · 코인 +14% · 소통 던전 ${AFFINITY_LABEL}`,
  },
  "social-023": {
    // 소중한 사람에게 선물하기 — 진심의 연결 (~7 합, coin 17%)
    effects: [
      { kind: "stat", stats: { agi: 4, vit: 3 } },
      { kind: "special", type: "coinBoost", value: 17 },
      { kind: "affinity", category: "social", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `AGI +4 · VIT +3 · 코인 +17% · 소통 던전 ${AFFINITY_LABEL}`,
  },
  "social-033": {
    // 봉사활동 2시간 — 넓은 품의 영웅 (~9 합, heal 20)
    effects: [
      { kind: "stat", stats: { vit: 5, agi: 4 } },
      { kind: "special", type: "healStart", value: 20 },
      { kind: "affinity", category: "social", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +5 · AGI +4 · 시작 HP +20 · 소통 던전 ${AFFINITY_LABEL}`,
  },

  // === 생산성 3종 — 집중, 돌파, 달성 ===
  "productivity-005": {
    // 1시간 딥워크 — 집중의 결정체 (DEX+5, xp 20%)
    effects: [
      { kind: "stat", stats: { dex: 5 } },
      { kind: "special", type: "xpBoost", value: 20 },
      { kind: "affinity", category: "productivity", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `DEX +5 · XP +20% · 생산성 던전 ${AFFINITY_LABEL}`,
  },
  "productivity-023": {
    // 미루던 일 하나 끝내기 — 돌파의 일격 (~9 합 + 3종 효과)
    effects: [
      { kind: "stat", stats: { dex: 5, str: 3, crit: 3 } },
      { kind: "affinity", category: "productivity", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `DEX +5 · STR +3 · CRIT +3% · 생산성 던전 ${AFFINITY_LABEL}`,
  },
  "productivity-033": {
    // 큰 프로젝트 마일스톤 완수 — 거장의 달성 (~11 합, xp 25%)
    effects: [
      { kind: "stat", stats: { dex: 7, str: 4 } },
      { kind: "special", type: "xpBoost", value: 25 },
      { kind: "affinity", category: "productivity", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `DEX +7 · STR +4 · XP +25% · 생산성 던전 ${AFFINITY_LABEL}`,
  },

  // === 건강 3종 — 회복, 밤, 자연 ===
  "wellness-005": {
    // 반신욕 30분 — 깊은 회복 (VIT+5, heal 30)
    effects: [
      { kind: "stat", stats: { vit: 5 } },
      { kind: "special", type: "healStart", value: 30 },
      { kind: "affinity", category: "wellness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +5 · 시작 HP +30 · 건강 던전 ${AFFINITY_LABEL}`,
  },
  "wellness-023": {
    // 스크린 없는 저녁 — 회복의 밤 (VIT+5, heal 22, monster -10%)
    effects: [
      { kind: "stat", stats: { vit: 5 } },
      { kind: "special", type: "healStart", value: 22 },
      { kind: "special", type: "monsterFrequency", value: -10 },
      { kind: "affinity", category: "wellness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +5 · 시작 HP +22 · 몬스터 조우 -10% · 건강 던전 ${AFFINITY_LABEL}`,
  },
  "wellness-033": {
    // 자연에서 당일치기 힐링 — 완벽한 복원 (~10 합, heal 45 최상위)
    effects: [
      { kind: "stat", stats: { vit: 7, agi: 3 } },
      { kind: "special", type: "healStart", value: 45 },
      { kind: "affinity", category: "wellness", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `VIT +7 · AGI +3 · 시작 HP +45 · 건강 던전 ${AFFINITY_LABEL}`,
  },

  // === 트렌딩 2종 — 올라운더, 절대집중 ===
  "trending-008": {
    // 새벽 5시 갓생 루틴 — 남들이 잘 때 (모든 스탯 +3 = 15 합)
    effects: [
      { kind: "stat", stats: { str: 3, int: 3, dex: 3, vit: 3, agi: 3 } },
      { kind: "affinity", category: "trending", multiplier: AFFINITY_MULTIPLIER },
    ],
    description: `모든 스탯 +3 · 트렌딩 던전 ${AFFINITY_LABEL}`,
  },
  "trending-025": {
    // Lock In 세션 — 절대 집중 (DEX+6, crit +4%, xp 20%)
    effects: [
      { kind: "stat", stats: { dex: 6, crit: 4 } },
      { kind: "special", type: "xpBoost", value: 20 },
    ],
    description: "DEX +6 · CRIT +4% · XP +20%",
  },
};

// ─────────────────────────────────────────────────────────
// RARE / UNIQUE — auto-gen (rarity scale + 특수효과 / 친화)
// ─────────────────────────────────────────────────────────

/** 카테고리 → 주 스탯 매핑 (auto-gen 용) */
const CATEGORY_PRIMARY_STAT: Record<Category, keyof import("@/types/uphero").HeroBaseStats> = {
  fitness: "str",
  learning: "int",
  mindfulness: "agi",
  nutrition: "vit",
  social: "agi",
  productivity: "dex",
  wellness: "vit",
  trending: "crit",
};

/**
 * 카테고리 → auto-gen 시 쓸 특수효과 value.
 * Phase 4b.1b 밸런스 조정: 전반 -30% 수준으로 약화 (버프 과도 인플레이션 방지).
 */
const CATEGORY_SPECIAL: Record<
  Category,
  { type: import("@/types/uphero").SpecialEffect; rareValue: number; uniqueValue: number }
> = {
  fitness: { type: "critBonus", rareValue: 1, uniqueValue: 3 },
  learning: { type: "xpBoost", rareValue: 7, uniqueValue: 14 },
  mindfulness: { type: "monsterFrequency", rareValue: -7, uniqueValue: -10 },
  nutrition: { type: "healStart", rareValue: 10, uniqueValue: 20 },
  social: { type: "coinBoost", rareValue: 7, uniqueValue: 14 },
  productivity: { type: "xpBoost", rareValue: 10, uniqueValue: 18 },
  wellness: { type: "healStart", rareValue: 15, uniqueValue: 28 },
  trending: { type: "critBonus", rareValue: 2, uniqueValue: 4 },
};

function generateRareBuff(card: ChallengeCard): CardBuff {
  const primary = CATEGORY_PRIMARY_STAT[card.category];
  const special = CATEGORY_SPECIAL[card.category];
  const isCritStat = primary === "crit";
  const statValue = isCritStat ? 1 : 3; // rare: 스탯 3, crit 1% (Phase 4b.1b 축소)
  return {
    effects: [
      { kind: "stat", stats: { [primary]: statValue } },
      { kind: "special", type: special.type, value: special.rareValue },
    ],
    description: `${primary.toUpperCase()} +${statValue}${isCritStat ? "%" : ""} · ${describeSpecial(special.type, special.rareValue)}`,
  };
}

function generateUniqueBuff(card: ChallengeCard): CardBuff {
  const primary = CATEGORY_PRIMARY_STAT[card.category];
  const special = CATEGORY_SPECIAL[card.category];
  const isCritStat = primary === "crit";
  const statValue = isCritStat ? 3 : 5; // unique: 스탯 5, crit 3% (Phase 4b.1b 축소)
  // unique 는 50% 확률로 친화 vs 특수효과 (카드 id 의 마지막 숫자 홀짝 기반 — 결정론적)
  const useAffinity = (parseIdSuffix(card.id) % 2) === 0;
  if (useAffinity) {
    return {
      effects: [
        { kind: "stat", stats: { [primary]: statValue } },
        { kind: "affinity", category: card.category as DungeonId, multiplier: AFFINITY_MULTIPLIER },
      ],
      description: `${primary.toUpperCase()} +${statValue}${isCritStat ? "%" : ""} · ${categoryLabel(card.category)} 던전 ${AFFINITY_LABEL}`,
    };
  }
  return {
    effects: [
      { kind: "stat", stats: { [primary]: statValue } },
      { kind: "special", type: special.type, value: special.uniqueValue },
    ],
    description: `${primary.toUpperCase()} +${statValue}${isCritStat ? "%" : ""} · ${describeSpecial(special.type, special.uniqueValue)}`,
  };
}

/** id 의 뒷숫자 추출 (예: "fitness-012" → 12) */
function parseIdSuffix(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** 특수효과 한국어 요약 */
function describeSpecial(
  type: import("@/types/uphero").SpecialEffect,
  value: number,
): string {
  const sign = value >= 0 ? "+" : "";
  switch (type) {
    case "dropRate":
      return `드롭 ${sign}${value}%`;
    case "monsterFrequency":
      return `몬스터 조우 ${sign}${value}%`;
    case "coinBoost":
      return `코인 ${sign}${value}%`;
    case "xpBoost":
      return `XP ${sign}${value}%`;
    case "critBonus":
      return `CRIT ${sign}${value}%`;
    case "healStart":
      return `시작 HP ${sign}${value}`;
  }
}

/** 카테고리 한국어 라벨 (친화 문구용) */
function categoryLabel(c: Category): string {
  const labels: Record<Category, string> = {
    fitness: "운동",
    learning: "학습",
    mindfulness: "명상",
    nutrition: "식단",
    social: "소통",
    productivity: "생산성",
    wellness: "건강",
    trending: "트렌딩",
  };
  return labels[c];
}

// ─────────────────────────────────────────────────────────
// 메인 API
// ─────────────────────────────────────────────────────────

/**
 * 카드의 버프를 rarity 별 규칙으로 resolve.
 *   legend → 커스텀 lookup (LEGEND_BUFFS)
 *   unique → auto-gen (카테고리 주 스탯 + 친화/특수 결정)
 *   rare   → auto-gen (카테고리 주 스탯 + 특수효과)
 *   normal → 카테고리 공통 템플릿 (NORMAL_BUFFS)
 */
export function getCardBuff(card: ChallengeCard): CardBuff {
  if (card.rarity === "legend") {
    return LEGEND_BUFFS[card.id] ?? generateUniqueBuff(card); // 안전 fallback
  }
  if (card.rarity === "unique") return generateUniqueBuff(card);
  if (card.rarity === "rare") return generateRareBuff(card);
  return NORMAL_BUFFS[card.category];
}
