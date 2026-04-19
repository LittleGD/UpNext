"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import MinigameView from "@/components/minigame/MinigameView";

/**
 * /minigame — 카드매치 미니게임 엔트리.
 * phase 기반 렌더링은 <MinigameView /> 가 담당한다 (playground 와 공유).
 */
export default function MinigamePage() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  // 페이지 이탈 시 자동 리셋은 하지 않음 — 티켓이 이미 소비된 런이 실수로 파기되는
  // 이슈(Codex [high]) 방지. 명시적 종료는 HUD/Exit 오버레이의 exitRun 액션으로만 일어난다.

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="skeleton w-32 h-4" />
      </div>
    );
  }

  return <MinigameView />;
}
