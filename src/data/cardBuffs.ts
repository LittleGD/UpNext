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

const LEGEND_BUFFS: Record<string, CardBuff> = {
  // === 운동 3종 — 지구력, 정복, 유연함 ===
  "fitness-008": {
    // 5km 러닝 — 장거리 러너의 지구력
    effects: [
      { kind: "stat", stats: { str: 8, vit: 5 } },
      { kind: "affinity", category: "fitness", multiplier: 2 },
    ],
    description: "STR +8 · VIT +5 · 운동 던전 2배",
  },
  "fitness-023": {
    // 등산 1시간 — 정복자의 걸음
    effects: [
      { kind: "stat", stats: { str: 10, vit: 8 } },
      { kind: "affinity", category: "fitness", multiplier: 2 },
    ],
    description: "STR +10 · VIT +8 · 운동 던전 2배",
  },
  "fitness-033": {
    // 수영 30분 — 유연한 강함
    effects: [
      { kind: "stat", stats: { str: 7, agi: 6, crit: 3 } },
      { kind: "affinity", category: "fitness", multiplier: 2 },
    ],
    description: "STR +7 · AGI +6 · CRIT +3% · 운동 던전 2배",
  },

  // === 식단 3종 — 정성, 회복, 준비 ===
  "nutrition-006": {
    // 간식 대신 견과류 — 현명한 선택
    effects: [
      { kind: "stat", stats: { vit: 6, crit: 3 } },
      { kind: "affinity", category: "nutrition", multiplier: 2 },
    ],
    description: "VIT +6 · CRIT +3% · 식단 던전 2배",
  },
  "nutrition-023": {
    // 건강 도시락 만들기 — 정성의 한 끼
    effects: [
      { kind: "stat", stats: { vit: 8 } },
      { kind: "special", type: "healStart", value: 40 },
      { kind: "affinity", category: "nutrition", multiplier: 2 },
    ],
    description: "VIT +8 · 시작 HP +40 · 식단 던전 2배",
  },
  "nutrition-033": {
    // 주간 식단 미리 준비 — 준비된 자의 여유
    effects: [
      { kind: "stat", stats: { vit: 9 } },
      { kind: "special", type: "coinBoost", value: 20 },
      { kind: "affinity", category: "nutrition", multiplier: 2 },
    ],
    description: "VIT +9 · 코인 +20% · 식단 던전 2배",
  },

  // === 명상 3종 — 자연, 침묵, 단절 ===
  "mindfulness-005": {
    // 자연 속 산책 — 자연의 지혜
    effects: [
      { kind: "stat", stats: { agi: 5, vit: 5 } },
      { kind: "affinity", category: "mindfulness", multiplier: 2 },
    ],
    description: "AGI +5 · VIT +5 · 명상 던전 2배",
  },
  "mindfulness-023": {
    // 디지털 디톡스 하루 — 고요의 힘
    effects: [
      { kind: "stat", stats: { agi: 8, dex: 4 } },
      { kind: "special", type: "monsterFrequency", value: -20 },
      { kind: "affinity", category: "mindfulness", multiplier: 2 },
    ],
    description: "AGI +8 · DEX +4 · 몬스터 조우 -20% · 명상 던전 2배",
  },
  "mindfulness-033": {
    // 반나절 침묵 시간 — 침묵의 각성
    effects: [
      { kind: "stat", stats: { agi: 10, int: 5 } },
      { kind: "affinity", category: "mindfulness", multiplier: 2 },
    ],
    description: "AGI +10 · INT +5 · 명상 던전 2배",
  },

  // === 학습 3종 — 넓은 시야, 지혜, 사유 ===
  "learning-006": {
    // 다큐멘터리 보기 — 넓은 시야
    effects: [
      { kind: "stat", stats: { int: 8 } },
      { kind: "special", type: "xpBoost", value: 25 },
      { kind: "affinity", category: "learning", multiplier: 2 },
    ],
    description: "INT +8 · XP +25% · 학습 던전 2배",
  },
  "learning-023": {
    // 독서 1시간 — 지혜의 문
    effects: [
      { kind: "stat", stats: { int: 10 } },
      { kind: "special", type: "xpBoost", value: 30 },
      { kind: "affinity", category: "learning", multiplier: 2 },
    ],
    description: "INT +10 · XP +30% · 학습 던전 2배",
  },
  "learning-033": {
    // 한 주제로 글 한 편 쓰기 — 사유의 완성
    effects: [
      { kind: "stat", stats: { int: 12 } },
      { kind: "special", type: "dropRate", value: 15 },
      { kind: "affinity", category: "learning", multiplier: 2 },
    ],
    description: "INT +12 · 드롭 +15% · 학습 던전 2배",
  },

  // === 소통 3종 — 진심, 품, 연결 ===
  "social-005": {
    // 손편지 쓰기 — 정성 담긴 연결
    effects: [
      { kind: "stat", stats: { agi: 6 } },
      { kind: "special", type: "coinBoost", value: 20 },
      { kind: "affinity", category: "social", multiplier: 2 },
    ],
    description: "AGI +6 · 코인 +20% · 소통 던전 2배",
  },
  "social-023": {
    // 소중한 사람에게 선물하기 — 진심의 연결
    effects: [
      { kind: "stat", stats: { agi: 6, vit: 4 } },
      { kind: "special", type: "coinBoost", value: 25 },
      { kind: "affinity", category: "social", multiplier: 2 },
    ],
    description: "AGI +6 · VIT +4 · 코인 +25% · 소통 던전 2배",
  },
  "social-033": {
    // 봉사활동 2시간 — 넓은 품의 영웅
    effects: [
      { kind: "stat", stats: { vit: 8, agi: 6 } },
      { kind: "special", type: "healStart", value: 30 },
      { kind: "affinity", category: "social", multiplier: 2 },
    ],
    description: "VIT +8 · AGI +6 · 시작 HP +30 · 소통 던전 2배",
  },

  // === 생산성 3종 — 집중, 돌파, 달성 ===
  "productivity-005": {
    // 1시간 딥워크 — 집중의 결정체
    effects: [
      { kind: "stat", stats: { dex: 8 } },
      { kind: "special", type: "xpBoost", value: 30 },
      { kind: "affinity", category: "productivity", multiplier: 2 },
    ],
    description: "DEX +8 · XP +30% · 생산성 던전 2배",
  },
  "productivity-023": {
    // 미루던 일 하나 끝내기 — 돌파의 일격
    effects: [
      { kind: "stat", stats: { dex: 7, str: 4, crit: 5 } },
      { kind: "affinity", category: "productivity", multiplier: 2 },
    ],
    description: "DEX +7 · STR +4 · CRIT +5% · 생산성 던전 2배",
  },
  "productivity-033": {
    // 큰 프로젝트 마일스톤 완수 — 거장의 달성
    effects: [
      { kind: "stat", stats: { dex: 10, str: 6 } },
      { kind: "special", type: "xpBoost", value: 40 },
      { kind: "affinity", category: "productivity", multiplier: 2 },
    ],
    description: "DEX +10 · STR +6 · XP +40% · 생산성 던전 2배",
  },

  // === 건강 3종 — 회복, 밤, 자연 ===
  "wellness-005": {
    // 반신욕 30분 — 깊은 회복
    effects: [
      { kind: "stat", stats: { vit: 7 } },
      { kind: "special", type: "healStart", value: 50 },
      { kind: "affinity", category: "wellness", multiplier: 2 },
    ],
    description: "VIT +7 · 시작 HP +50 · 건강 던전 2배",
  },
  "wellness-023": {
    // 스크린 없는 저녁 — 회복의 밤
    effects: [
      { kind: "stat", stats: { vit: 8 } },
      { kind: "special", type: "healStart", value: 35 },
      { kind: "special", type: "monsterFrequency", value: -15 },
      { kind: "affinity", category: "wellness", multiplier: 2 },
    ],
    description: "VIT +8 · 시작 HP +35 · 몬스터 조우 -15% · 건강 던전 2배",
  },
  "wellness-033": {
    // 자연에서 당일치기 힐링 — 완벽한 복원
    effects: [
      { kind: "stat", stats: { vit: 10, agi: 5 } },
      { kind: "special", type: "healStart", value: 70 },
      { kind: "affinity", category: "wellness", multiplier: 2 },
    ],
    description: "VIT +10 · AGI +5 · 시작 HP +70 · 건강 던전 2배",
  },

  // === 트렌딩 2종 — 올라운더, 절대집중 ===
  "trending-008": {
    // 새벽 5시 갓생 루틴 — 남들이 잘 때
    effects: [
      { kind: "stat", stats: { str: 4, int: 4, dex: 4, vit: 4, agi: 4 } },
      { kind: "affinity", category: "trending", multiplier: 2 },
    ],
    description: "모든 스탯 +4 · 트렌딩 던전 2배",
  },
  "trending-025": {
    // Lock In 세션 — 절대 집중
    effects: [
      { kind: "stat", stats: { dex: 10, crit: 8 } },
      { kind: "special", type: "xpBoost", value: 30 },
    ],
    description: "DEX +10 · CRIT +8% · XP +30%",
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

/** 카테고리 → auto-gen 시 쓸 특수효과 */
const CATEGORY_SPECIAL: Record<
  Category,
  { type: import("@/types/uphero").SpecialEffect; rareValue: number; uniqueValue: number }
> = {
  fitness: { type: "critBonus", rareValue: 2, uniqueValue: 4 },
  learning: { type: "xpBoost", rareValue: 10, uniqueValue: 20 },
  mindfulness: { type: "monsterFrequency", rareValue: -10, uniqueValue: -15 },
  nutrition: { type: "healStart", rareValue: 15, uniqueValue: 30 },
  social: { type: "coinBoost", rareValue: 10, uniqueValue: 20 },
  productivity: { type: "xpBoost", rareValue: 15, uniqueValue: 25 },
  wellness: { type: "healStart", rareValue: 20, uniqueValue: 40 },
  trending: { type: "critBonus", rareValue: 3, uniqueValue: 6 },
};

function generateRareBuff(card: ChallengeCard): CardBuff {
  const primary = CATEGORY_PRIMARY_STAT[card.category];
  const special = CATEGORY_SPECIAL[card.category];
  const isCritStat = primary === "crit";
  const statValue = isCritStat ? 3 : 5; // rare 기본 스탯 값
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
  const statValue = isCritStat ? 5 : 8; // unique 기본 스탯 값
  // unique 는 50% 확률로 친화 vs 특수효과 (카드 id 의 마지막 숫자 홀짝 기반 — 결정론적)
  const useAffinity = (parseIdSuffix(card.id) % 2) === 0;
  if (useAffinity) {
    return {
      effects: [
        { kind: "stat", stats: { [primary]: statValue } },
        { kind: "affinity", category: card.category as DungeonId, multiplier: 2 },
      ],
      description: `${primary.toUpperCase()} +${statValue}${isCritStat ? "%" : ""} · ${categoryLabel(card.category)} 던전 2배`,
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
