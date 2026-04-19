"use client";

import { type ReactNode } from "react";
import { useMinigameStore } from "@/store/useMinigameStore";
import MinigameHome from "./MinigameHome";
import MinigameBoard from "./MinigameBoard";
import MinigameHUD from "./MinigameHUD";
import MinigameTileZoom from "./MinigameTileZoom";
import MinigameRoundResult from "./MinigameRoundResult";
import MinigameRewardDraft from "./MinigameRewardDraft";
import MinigameRunResult from "./MinigameRunResult";
import MinigameResultSummary from "./MinigameResultSummary";
import MinigameExitOverlay from "./MinigameExitOverlay";
import MinigameEffectToast from "./MinigameEffectToast";

/**
 * 미니게임 phase 기반 화면 분기 컨테이너.
 * /minigame (직접 진입) 과 /playground (game 탭) 양쪽에서 재사용된다.
 * 이전에는 playground 가 MinigameHome 만 렌더해서 Play 를 눌러도
 * phase 는 categoryFlash 로 바뀌지만 Board 가 안 보이는 회귀가 있었음.
 */
export default function MinigameView() {
  const phase = useMinigameStore((s) => s.phase);

  if (phase === "idle") return <MinigameHome />;

  // 몰입 모드 공통 래퍼: Exit 확인 오버레이는 모든 non-idle phase 에서 마운트되어
  // HUD X 버튼(confirm 공유) 과 top-right 오버레이 X 버튼을 관리한다.
  const withOverlay = (content: ReactNode, hudPhase: boolean) => (
    <>
      {content}
      <MinigameExitOverlay hideTopRightButton={hudPhase} />
    </>
  );

  if (phase === "categoryFlash" || phase === "peek" || phase === "playing") {
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
