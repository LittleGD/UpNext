/**
 * Phase 6-E (Track E, 피드백 22) — BagOverflowModal 마운트 게이트 (순수 셀렉터).
 *
 * 한 번의 정산이 pendingHeroLevelUp · pendingClassChoice · overflowDrops 를 동시에
 * 세울 수 있다. 닫을 수 없는 이 모달이 레벨업 연출과 전직 선택을 덮지 않게, 세 표면의
 * 순서를 여기서 고정한다: HeroLevelUpOverlay → ClassChoiceModal → BagOverflowModal.
 * 던전 진행 중(currentSession) 에도 띄우지 않는다 (캠프에서만).
 * iOS UpHeroGameView 의 if-let 게이트와 같은 조건.
 */

import type { UpHeroState } from "@/types/uphero";

export function isBagOverflowVisible(
  s: Pick<
    UpHeroState,
    "overflowDrops" | "currentSession" | "pendingHeroLevelUp" | "pendingClassChoice"
  >,
): boolean {
  return (
    (s.overflowDrops?.length ?? 0) > 0 &&
    s.currentSession == null &&
    s.pendingHeroLevelUp == null &&
    s.pendingClassChoice == null
  );
}
