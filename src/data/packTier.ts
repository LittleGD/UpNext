import type { ChallengeCard, Rarity } from "@/types/card";
import { drawFromPool } from "@/lib/deck";

/**
 * 카드팩 등급 (Pack Tier) — 레벨업 시 1회 굴리는 등급.
 *
 * - 굴린 등급에 따라 카드 수와 오픈 연출이 결정된다.
 * - 카드 등급(Rarity) 과 같은 4단계 enum 을 재사용 (normal/rare/unique/legend).
 * - 팩 안에 들어가는 카드의 등급은 우선 같은 tier 로 채우고, 부족하면
 *   기존 가중 랜덤(drawFromPool) 으로 보충 — 풀 고갈 graceful.
 */

const TIER_ORDER: Rarity[] = ["normal", "rare", "unique", "legend"];

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

export function rollPackTier(): Rarity {
  const total = TIER_ORDER.reduce((s, t) => s + PACK_TIER_WEIGHT[t], 0);
  let roll = Math.random() * total;
  for (const tier of TIER_ORDER) {
    roll -= PACK_TIER_WEIGHT[tier];
    if (roll <= 0) return tier;
  }
  // Math.random() < 1 이고 총합이 양수 이므로 위 루프에서 항상 return.
  // 이 라인은 부동소수점 안전망 (실제로 도달 불가).
  return "normal";
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
