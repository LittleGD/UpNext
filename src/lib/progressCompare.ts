import type { UserProgress } from "@/types/game";

/**
 * 두 progress 의 "플레이 성과" 단조 필드를 벡터로 비교.
 *
 * 반환값:
 *  - "equal"    : 모든 필드 동일
 *  - "aAhead"   : a 의 모든 필드가 b 이상이고 최소 1개는 strictly 큼
 *  - "bAhead"   : 그 반대
 *  - "conflict" : 일부는 a 가 앞서고 일부는 b 가 앞섬
 *
 * 중요: tickets 는 spend 로 감소 가능 → 단조 비교 불가하므로 제외.
 *
 * 호출처:
 *  - SyncProvider — 로그인 시 로컬 vs 클라우드 머지 결정
 *  - useGameStore._setFromCloud — 실시간 클라우드 emit 이 로컬을 strictly behind
 *    상태로 덮어쓰는 race condition 방어 (P0)
 */
export type ProgressCompareResult = "equal" | "aAhead" | "bAhead" | "conflict";

const MONOTONIC_FIELDS: Array<(p: UserProgress) => number> = [
  (p) => p.totalDaysCompleted || 0,
  (p) => (p.completionHistory || []).length,
  (p) => p.minigameRunsPlayed || 0,
  (p) => p.minigameBestMatches || 0,
  (p) => p.xp || 0,
  (p) => (p.unlockedCardIds || []).length,
  (p) => p.extraChallengesCompleted || 0,
  (p) => p.superChallengesCompleted || 0,
];

export function compareProgress(a: UserProgress, b: UserProgress): ProgressCompareResult {
  let aGteB = true;
  let bGteA = true;
  let anyDifference = false;
  for (const get of MONOTONIC_FIELDS) {
    const va = get(a);
    const vb = get(b);
    if (va > vb) bGteA = false;
    else if (vb > va) aGteB = false;
    if (va !== vb) anyDifference = true;
  }
  if (!anyDifference) return "equal";
  if (aGteB && !bGteA) return "aAhead";
  if (bGteA && !aGteB) return "bAhead";
  return "conflict";
}
