"use client";

/**
 * Phase 12e — 인터랙티브 미니게임 공용 인터페이스.
 *
 * 각 미니게임은 이 Props 를 받고 완료 시 onComplete 호출. 미니게임 내부에
 * 자체 timer / rAF / state 를 관리. DungeonView 는 onComplete 결과로
 * resolveMinigame(success) 만 호출.
 */

export interface MinigameProps {
  /** 난이도 (1 = 쉬움, 3 = 어려움). 각 미니게임이 자체 해석. */
  difficulty: 1 | 2 | 3;
  /** 완료 콜백. 성공/실패 + 점수 (optional). */
  onComplete: (result: { success: boolean; score?: number }) => void;
  /** 취소 콜백 — ESC / 뒤로가기로 중단 시 호출 (실패 처리). */
  onCancel: () => void;
}
