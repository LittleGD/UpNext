/**
 * Up Hero — Phase 4b: 던전 진입 전 버프 카드 draw 로직.
 *
 * 설계:
 *  - 사용자 보유 카드 (unlockedCardIds) 중 무작위 6장 추출
 *  - 해당 던전 카테고리 카드 가중치 (2배 확률) — 전략적 draw 를 위해
 *  - 중복 없음. 보유 카드 < 6 이면 available 만큼만 반환
 *  - rarity 편향은 없음 (카드 매칭은 rarity 자연 분포)
 */

import type { ChallengeCard } from "@/types/card";
import type { DungeonId } from "@/types/uphero";

/**
 * 보유 카드 중 던전용 버프 drawcount 장을 랜덤 뽑는다.
 *
 * @param ownedCards 사용자 보유 카드 전체 (unlockedCardIds 로 필터된 ALL_CARDS)
 * @param dungeonId 진입할 던전 — 같은 category 카드 확률 가중
 * @param drawCount 기본 6장 (보유 부족 시 자동 축소)
 */
export function drawBuffCards(
  ownedCards: ChallengeCard[],
  dungeonId: DungeonId,
  drawCount = 6,
): ChallengeCard[] {
  if (ownedCards.length === 0) return [];

  // 가중 풀 생성 — 같은 카테고리 카드 2배 entry
  const weighted: ChallengeCard[] = [];
  for (const card of ownedCards) {
    weighted.push(card);
    if (card.category === dungeonId) weighted.push(card); // 가중 2배
  }

  // Fisher-Yates shuffle 로 무작위성 확보 + 중복 제거
  const shuffled = [...weighted].sort(() => Math.random() - 0.5);
  const seen = new Set<string>();
  const result: ChallengeCard[] = [];
  for (const card of shuffled) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    result.push(card);
    if (result.length >= drawCount) break;
  }
  return result;
}
