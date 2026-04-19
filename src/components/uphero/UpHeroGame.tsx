"use client";

/**
 * Up Hero (갓생 영웅) — 메인 entry.
 *
 * currentSession 의 status 가 "active" | "paused" | "awaitingChoice" 면 DungeonView,
 * 아니면 CampPlaceholder 로 라우팅.
 */

import { useEffect } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { getEffectiveHeroLevel } from "@/types/uphero";
import CampPlaceholder from "./CampPlaceholder";
import DungeonView from "./DungeonView";
import SessionResultModal from "./SessionResultModal";
import IdleRewardToast from "./IdleRewardToast";
import ClassAwakenModal from "./ClassAwakenModal";
import UpHeroLevelUpOverlay from "./UpHeroLevelUpOverlay";
import { GB } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

export default function UpHeroGame() {
  const { t } = useTranslation();
  const initialize = useUpHeroStore((s) => s.initialize);
  const isLoaded = useUpHeroStore((s) => s.isLoaded);
  // Phase 9b — tick 마다 re-render 하는 session 전체 구독 대신 status 만.
  //   DungeonView / SessionResultModal 은 각자 session 을 구독하므로 여기서는
  //   routing 결정에 필요한 status 만 있으면 충분. tick-rate rerender 방지.
  const sessionStatus = useUpHeroStore((s) => s.currentSession?.status);
  const gameLoaded = useGameStore((s) => s.isLoaded);
  const heroClassType = useUpHeroStore((s) => s.hero.classType);
  const assignClass = useUpHeroStore((s) => s.assignClass);
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const heroLevel = getEffectiveHeroLevel(gameLevel, heroStartLevel);

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  // Phase 5c-fix #4: class 할당 race condition 안전장치.
  // useUpHeroStore.initialize 는 useGameStore 가 아직 load 안 됐을 때 실행될
  // 수 있어서 heroLevel=1 로 safety path 가 발동 안 함. 이후 두 store 모두
  // load 되고 heroLevel>=30 인데 classType 이 여전히 null 이면 여기서 재시도.
  // Phase 9d: 챌린지 레벨이 아닌 영웅 레벨 기준.
  useEffect(() => {
    if (!isLoaded || !gameLoaded) return;
    if (heroClassType !== null) return;
    if (heroLevel < 30) return;
    assignClass();
  }, [isLoaded, gameLoaded, heroClassType, heroLevel, assignClass]);

  if (!isLoaded || !gameLoaded) {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh] rounded-md"
        style={{ background: GB.darkest, color: GB.light }}
      >
        <div className="text-xs font-mono">{t("common.loading")}</div>
      </div>
    );
  }

  const inDungeon =
    sessionStatus === "active" ||
    sessionStatus === "awaitingChoice" ||
    sessionStatus === "paused";

  return (
    <>
      {inDungeon ? <DungeonView /> : <CampPlaceholder />}
      {/* 완료된 세션 결산 modal — camp 상태일 때 노출 */}
      {sessionStatus === "completed" && <SessionResultModal />}
      {/* Phase 5b.1 — 앱 재진입 시 idle accrual 토스트. 상단 배너로 표시. */}
      <IdleRewardToast />
      {/* Phase 5c.3 — Lv 30 도달 시 class 분화 풀스크린 연출. */}
      <ClassAwakenModal />
      {/* Phase 15 — 챌린지 레벨업 시 전역 축하 오버레이. */}
      <UpHeroLevelUpOverlay />
    </>
  );
}
