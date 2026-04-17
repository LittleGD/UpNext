import type { Category } from "./card";

// === 스티커 (추후 확장용) — 폴라로이드 위에 자유롭게 배치 가능한 데코레이션 ===
// 위치는 % 좌표 (반응형). rotation/scale 은 자유 변형. zIndex 로 레이어 순서.
export interface Sticker {
  id: string;                     // 고유 식별
  type: "emoji" | "image";        // 향후 확장 (text/shape 등)
  content: string;                // emoji string OR image URL/asset key
  x: number;                      // 0-100 (% from left)
  y: number;                      // 0-100 (% from top)
  rotation: number;               // degrees
  scale: number;                  // 1 = 기본
  zIndex?: number;
}

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
  stickers?: Sticker[];           // 추후 스티커 기능 — 미사용 시 undefined
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
