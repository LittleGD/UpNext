import type { ChallengeCard, Rarity } from "@/types/card";
import { drawFromPool } from "@/lib/deck";

/**
 * 카드팩 등급 (Pack Tier) — 레벨업 시 1회 굴리는 등급.
 *
 * - 굴린 등급에 따라 카드 수와 오픈 연출이 결정된다.
 * - 카드 등급(Rarity) 과 같은 4단계 enum 을 재사용 (normal/rare/unique/legend).
 * - 팩 안에 들어가는 카드의 등급은 우선 같은 tier 로 채우고, 부족하면
 *   기존 가중 랜덤(drawFromPool) 으로 보충 — 풀 고갈 graceful.
 *
 * 팩 종류 (PackKind) — openCardPack 큐 소진 순서 full > bonus > levelUp.
 * - full   : 상점 풀 카드팩 (SHOP_PRICES.cardPackFull). 항상 FULL_PACK_CARD_COUNT 장,
 *            tier 는 normal 을 제외한 가중치 재정규화 (rare 60% / unique 30% / legend 10%).
 * - bonus  : 추가/슈퍼 풀클리어 보너스 카드 1장 (normal tier).
 * - levelUp: 레벨업 팩. rollPackTier (normal 50 / rare 30 / unique 15 / legend 5) → 2/3/4/5 장.
 *
 * 부족분 보상 (shortfallCompensation) — 잠긴 카드가 기대 장수보다 적을 때:
 * - full   : 장당 160 코인 = SHOP_PRICES.cardPackFull(800) / FULL_PACK_CARD_COUNT(5) 비례 환급.
 * - levelUp: 장당 25 XP + 50 코인 = COLLECTION_COMPENSATION_BONUS (카드 1장 환산).
 * - bonus  : 부족분 없음 (풀 고갈은 100% 분기에서 처리).
 * iOS 미러: Models/PackTier.swift (fullPackCardCount / fullPackTierFloor / rollFullPackTier /
 * shortfallCompensation / fullPackCollectionRefundCoins).
 */

const TIER_ORDER: Rarity[] = ["normal", "rare", "unique", "legend"];

export type PackKind = "full" | "bonus" | "levelUp";

/** 풀 카드팩 고정 장수 (tier 와 무관). 상점 카피 "5장 뽑기" 와 일치. */
export const FULL_PACK_CARD_COUNT = 5;

/** 풀 카드팩 tier 하한 — 이 등급 이상만 굴린다 (normal 제외). */
export const FULL_PACK_TIER_FLOOR: Rarity = "rare";

export const PACK_TIER_WEIGHT: Record<Rarity, number> = {
  normal: 50,
  rare: 30,
  unique: 15,
  legend: 5,
};

export const PACK_TIER_COUNT: Record<Rarity, number> = {
  normal: 2,
  rare: 3,
  unique: 4,
  legend: 5,
};

/**
 * 주어진 tier 목록 안에서 PACK_TIER_WEIGHT 가중 굴림.
 * 가중치는 목록 총합으로 재정규화된다 (normal 을 빼면 rare 60 / unique 30 / legend 10).
 * 경계: roll=r*total 에서 순서대로 빼며 `<= 0` 에서 멈춤 (r=0 → 첫 tier).
 */
export function rollPackTierFrom(tiers: Rarity[]): Rarity {
  const total = tiers.reduce((s, t) => s + PACK_TIER_WEIGHT[t], 0);
  let roll = Math.random() * total;
  for (const tier of tiers) {
    roll -= PACK_TIER_WEIGHT[tier];
    if (roll <= 0) return tier;
  }
  // Math.random() < 1 이고 총합이 양수 이므로 위 루프에서 항상 return.
  // 이 라인은 부동소수점 안전망 (실제로 도달 불가).
  return tiers[0] ?? "normal";
}

/** 레벨업 팩 tier — normal 50% / rare 30% / unique 15% / legend 5%. */
export function rollPackTier(): Rarity {
  return rollPackTierFrom(TIER_ORDER);
}

/** 상점 풀 카드팩 tier — rare 60% / unique 30% / legend 10% (normal 제외). */
export function rollFullPackTier(): Rarity {
  return rollPackTierFrom(TIER_ORDER.slice(TIER_ORDER.indexOf(FULL_PACK_TIER_FLOOR)));
}

/**
 * 팩 등급에 맞춰 카드 N장 드로우.
 *  - 1단계: 같은 tier 카드만으로 채우기 시도
 *  - 2단계: 부족분은 drawFromPool (가중 랜덤 + 피티) 로 보충
 *
 * 풀 고갈 시 자연스럽게 다른 등급으로 떨어지므로
 * "legend 5장 드로우 → 매번 5장 다 legend" 가 보장되진 않지만,
 * 풀이 충분할 때는 의도된 등급 일관성을 유지한다.
 */
export function drawTierPack(
  pool: ChallengeCard[],
  tier: Rarity,
  count: number,
): ChallengeCard[] {
  if (pool.length === 0) return [];

  const tiered = pool.filter((c) => c.rarity === tier);
  const shuffled = shuffle(tiered);
  const fromTier = shuffled.slice(0, Math.min(count, shuffled.length));
  if (fromTier.length >= count) return fromTier;

  const usedIds = new Set(fromTier.map((c) => c.id));
  const remaining = pool.filter((c) => !usedIds.has(c.id));
  const extra = drawFromPool(remaining, count - fromTier.length);
  return [...fromTier, ...extra];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 컬렉션 100% 도달 후 받는 팩의 환산 보상.
 *
 * 메인 게임에 코인 시스템이 없으므로:
 *  - XP 는 progress.xp 직접 가산 (normalize 안 함 → 즉시 레벨 갱신 안 됨,
 *    다음 일반 챌린지 완료 시 자연스럽게 catch up)
 *  - Coins 는 useUpHeroStore.addCoins(N) 으로 영웅 시스템 코인에 적립
 *
 * 단가는 "팩이 가질 수 있었던 카드의 XP_PER_RARITY" 와 비례하도록 설정.
 */
export const COLLECTION_COMPENSATION_PER_TIER: Record<Rarity, { xp: number; coins: number }> = {
  normal: { xp: 50, coins: 100 },
  rare:   { xp: 100, coins: 200 },
  unique: { xp: 200, coins: 400 },
  legend: { xp: 500, coins: 1000 },
};

// 보너스 카드 (1장) 환산 — normal pack 의 절반 정도
export const COLLECTION_COMPENSATION_BONUS = { xp: 25, coins: 50 };

// 첫 회 컬렉션 100% 도달 시 1회성 보너스 (환산 보상에 추가).
export const COLLECTION_FIRST_CLEAR_BONUS = { xp: 500, coins: 2000 };

/**
 * 레벨업 levelsGained 만큼 팩 등급을 굴려 환산 보상 합산.
 * 컬렉션 100% 완료자가 레벨업/보너스 카드를 받았어야 할 시점에 사용.
 */
export function rollCompensationForLevels(levelsGained: number): { xp: number; coins: number } {
  let xp = 0;
  let coins = 0;
  for (let i = 0; i < Math.max(0, levelsGained); i++) {
    const t = rollPackTier();
    xp += COLLECTION_COMPENSATION_PER_TIER[t].xp;
    coins += COLLECTION_COMPENSATION_PER_TIER[t].coins;
  }
  return { xp, coins };
}

/**
 * 팩 부족분(잠긴 카드 < 기대 장수) 장당 보상.
 *  - full   : 160 코인 = SHOP_PRICES.cardPackFull(800) / FULL_PACK_CARD_COUNT(5). 결제액 비례 환급.
 *  - levelUp: COLLECTION_COMPENSATION_BONUS 와 동일 (카드 1장 환산).
 * bonus 카드는 부족분이 생기지 않는다 (빈 풀 = 100% 분기).
 * 테스트가 full.coins * FULL_PACK_CARD_COUNT === SHOP_PRICES.cardPackFull 을 단언한다.
 */
export const PACK_SHORTFALL_COMPENSATION: Record<Exclude<PackKind, "bonus">, { xp: number; coins: number }> = {
  full: { xp: 0, coins: 160 },
  levelUp: { xp: COLLECTION_COMPENSATION_BONUS.xp, coins: COLLECTION_COMPENSATION_BONUS.coins },
};

export function shortfallCompensation(
  kind: Exclude<PackKind, "bonus">,
  missing: number,
): { xp: number; coins: number } {
  const m = Math.max(0, missing);
  const unit = PACK_SHORTFALL_COMPENSATION[kind];
  return { xp: m * unit.xp, coins: m * unit.coins };
}

/**
 * 컬렉션 100% 상태에서 남아 있는 풀 카드팩 1개당 환급 코인 (= 800, 결제액 전액).
 * openCardPack 의 100% 분기에서 pendingFullPacks 를 코인으로 변환할 때 사용.
 */
export const FULL_PACK_COLLECTION_REFUND_COINS =
  FULL_PACK_CARD_COUNT * PACK_SHORTFALL_COMPENSATION.full.coins;
