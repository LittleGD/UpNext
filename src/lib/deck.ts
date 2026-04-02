import type { ChallengeCard, Rarity } from "@/types/card";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { DRAW_COUNT } from "@/types/game";

// === 가중 랜덤 선택 (Weighted Random Selection) ===
// 각 등급에 "무게"를 부여해서, 무게가 큰 등급(normal)이 더 자주 뽑히게 하는 방식
// 주사위를 던진다고 생각하면: normal은 면이 60개, legend는 면이 3개인 주사위

function getWeightedRandomRarity(): Rarity {
  const rarities = Object.entries(RARITY_CONFIG) as [Rarity, typeof RARITY_CONFIG.normal][];
  const totalWeight = rarities.reduce((sum, [, config]) => sum + config.weight, 0);
  let random = Math.random() * totalWeight;

  for (const [rarity, config] of rarities) {
    random -= config.weight;
    if (random <= 0) return rarity;
  }

  return "normal"; // fallback
}

// === 카드 드로우 알고리즘 ===
// 1. 해금된 카드 풀에서 등급별로 가중 랜덤 선택
// 2. 같은 카테고리 중복 최소화 (다양성)
// 3. 피티 시스템: 6장 중 최소 1장은 normal이 아닌 카드 보장

export function drawCards(unlockedCards: ChallengeCard[]): ChallengeCard[] {
  if (unlockedCards.length <= DRAW_COUNT) {
    return shuffleArray([...unlockedCards]);
  }

  const drawn: ChallengeCard[] = [];
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();
  let attempts = 0;
  const maxAttempts = 100;

  while (drawn.length < DRAW_COUNT && attempts < maxAttempts) {
    attempts++;
    const targetRarity = getWeightedRandomRarity();

    // 해당 등급 카드들 중 아직 안 뽑힌 것들 필터링
    let candidates = unlockedCards.filter(
      (card) => card.rarity === targetRarity && !usedIds.has(card.id)
    );

    // 카테고리 다양성: 이미 뽑힌 카테고리는 피하기 (가능한 경우)
    if (drawn.length < 4) {
      const diverseCandidates = candidates.filter(
        (card) => !usedCategories.has(card.category)
      );
      if (diverseCandidates.length > 0) {
        candidates = diverseCandidates;
      }
    }

    // 해당 등급에 후보가 없으면 다음 시도
    if (candidates.length === 0) continue;

    // 랜덤으로 하나 선택
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[randomIndex];
    drawn.push(selected);
    usedIds.add(selected.id);
    usedCategories.add(selected.category);
  }

  // 피티 시스템 (Pity System): 6장이 모두 normal이면 하나를 교체
  const hasNonNormal = drawn.some((card) => card.rarity !== "normal");
  if (!hasNonNormal) {
    const nonNormalCards = unlockedCards.filter(
      (card) => card.rarity !== "normal" && !usedIds.has(card.id)
    );
    if (nonNormalCards.length > 0) {
      const replacement = nonNormalCards[Math.floor(Math.random() * nonNormalCards.length)];
      drawn[drawn.length - 1] = replacement;
    }
  }

  return drawn;
}

// === 등급 가중치 기반 N장 드로우 (카드팩 등 범용) ===
// 중복 없이, 등급 가중치에 따라 pool에서 count장 선택
export function drawFromPool(pool: ChallengeCard[], count: number): ChallengeCard[] {
  if (pool.length <= count) return shuffleArray([...pool]);

  const result: ChallengeCard[] = [];
  const usedIds = new Set<string>();
  let attempts = 0;

  while (result.length < count && attempts < 100) {
    attempts++;
    const targetRarity = getWeightedRandomRarity();
    const candidates = pool.filter(
      (c) => c.rarity === targetRarity && !usedIds.has(c.id)
    );
    if (candidates.length === 0) continue;

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    result.push(selected);
    usedIds.add(selected.id);
  }

  // 피티: 전부 normal이면 1장 교체
  if (result.length > 0 && result.every((c) => c.rarity === "normal")) {
    const nonNormal = pool.filter((c) => c.rarity !== "normal" && !usedIds.has(c.id));
    if (nonNormal.length > 0) {
      result[result.length - 1] = nonNormal[Math.floor(Math.random() * nonNormal.length)];
    }
  }

  return result;
}

// 배열 섞기 (Fisher-Yates Shuffle)
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
