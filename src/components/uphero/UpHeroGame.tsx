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
import CampPlaceholder from "./CampPlaceholder";
import DungeonView from "./DungeonView";
import SessionResultModal from "./SessionResultModal";
import { GB } from "@/lib/upHeroPalette";

export default function UpHeroGame() {
  const initialize = useUpHeroStore((s) => s.initialize);
  const isLoaded = useUpHeroStore((s) => s.isLoaded);
  const currentSession = useUpHeroStore((s) => s.currentSession);
  const gameLoaded = useGameStore((s) => s.isLoaded);

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  if (!isLoaded || !gameLoaded) {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh] rounded-md"
        style={{ background: GB.darkest, color: GB.light }}
      >
        <div className="text-xs font-mono">LOADING...</div>
      </div>
    );
  }

  const inDungeon =
    currentSession != null &&
    (currentSession.status === "active" ||
      currentSession.status === "awaitingChoice" ||
      currentSession.status === "paused");

  return (
    <>
      {inDungeon ? <DungeonView /> : <CampPlaceholder />}
      {/* 완료된 세션 결산 modal — camp 상태일 때 노출 */}
      {currentSession?.status === "completed" && <SessionResultModal />}
    </>
  );
}
