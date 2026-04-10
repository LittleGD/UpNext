"use client";

import { useEffect, type ReactNode } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useMinigameStore } from "@/store/useMinigameStore";
import MinigameHome from "@/components/minigame/MinigameHome";
import MinigameBoard from "@/components/minigame/MinigameBoard";
import MinigameHUD from "@/components/minigame/MinigameHUD";
import MinigameTileZoom from "@/components/minigame/MinigameTileZoom";
import MinigameRoundResult from "@/components/minigame/MinigameRoundResult";
import MinigameRewardDraft from "@/components/minigame/MinigameRewardDraft";
import MinigameRunResult from "@/components/minigame/MinigameRunResult";
import MinigameResultSummary from "@/components/minigame/MinigameResultSummary";
import MinigameExitOverlay from "@/components/minigame/MinigameExitOverlay";
import MinigameEffectToast from "@/components/minigame/MinigameEffectToast";

/**
 * /minigame — 카드매치 미니게임 엔트리.
 * phase 기반 조건부 렌더링.
 */
export default function MinigamePage() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const phase = useMinigameStore((s) => s.phase);

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

  // phase별 화면 분기
  if (phase === "idle") return <MinigameHome />;

  // 몰입 모드 공통 래퍼: Exit 확인 오버레이는 모든 non-idle phase에서 마운트되어
  // HUD X 버튼(confirm 공유)과 top-right 오버레이 X 버튼을 관리한다.
  const withOverlay = (content: ReactNode, hudPhase: boolean) => (
    <>
      {content}
      <MinigameExitOverlay hideTopRightButton={hudPhase} />
    </>
  );

  if (
    phase === "categoryFlash" ||
    phase === "peek" ||
    phase === "playing"
  ) {
    return withOverlay(
      <div className="flex flex-col min-h-screen">
        <MinigameHUD />
        <MinigameBoard />
        <MinigameTileZoom />
        <MinigameEffectToast />
      </div>,
      true,
    );
  }

  if (phase === "roundResult") return withOverlay(<MinigameRoundResult />, false);
  if (phase === "rewardDraft") return withOverlay(<MinigameRewardDraft />, false);
  if (phase === "runResult") return withOverlay(<MinigameRunResult />, false);
  if (phase === "runComplete") return <MinigameResultSummary />;

  return <MinigameHome />;
}
