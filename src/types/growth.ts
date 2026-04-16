import type { Category } from "./card";

// === 인증 사진 메타데이터 (IndexedDB의 Blob 제외, localStorage용 경량 객체) ===
export interface PhotoMeta {
  id: string;                     // "vp_{date}_{cardId}_{timestamp}"
  challengeCardId: string;
  challengeTitle: string;         // 스냅샷 (카드 제목 — 아카이브 라벨용)
  category: Category;
  date: string;                   // "2026-04-15"
  timestamp: number;              // Unix ms
  memo: string;                   // 뒷면 메모 (max 200자)
  treePosition: TreePosition | null;
}

export interface TreePosition {
  branchIndex: number;
  slot: number;                   // 같은 가지 내 순서
}

// === 나무 성장 단계 ===
export type TreeStage = "seed" | "sprout" | "sapling" | "young" | "mature" | "ancient";

export const TREE_STAGE_THRESHOLDS: Record<TreeStage, number> = {
  seed: 0,
  sprout: 1,
  sapling: 4,
  young: 11,
  mature: 26,
  ancient: 51,
};

/** 완료 횟수 → 현재 성장 단계 */
export function getTreeStage(completions: number): TreeStage {
  if (completions >= TREE_STAGE_THRESHOLDS.ancient) return "ancient";
  if (completions >= TREE_STAGE_THRESHOLDS.mature) return "mature";
  if (completions >= TREE_STAGE_THRESHOLDS.young) return "young";
  if (completions >= TREE_STAGE_THRESHOLDS.sapling) return "sapling";
  if (completions >= TREE_STAGE_THRESHOLDS.sprout) return "sprout";
  return "seed";
}

// === 캡처 플로우 단계 ===
export type CapturePhase = "idle" | "camera" | "ejecting" | "polaroid" | "memo" | "saving";
