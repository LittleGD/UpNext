"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { motion } from "framer-motion";
import ArchiveSheet from "@/components/growth/ArchiveSheet";
import type { DictKey } from "@/i18n";

const MinigameHome = lazy(() => import("@/components/minigame/MinigameHome"));
const UpHeroGame = lazy(() => import("@/components/uphero/UpHeroGame"));

type Tab = "uphero" | "archive" | "game";

const TABS: { key: Tab; labelKey: DictKey }[] = [
  { key: "uphero", labelKey: "playground.tab.uphero" },
  { key: "archive", labelKey: "playground.tab.archive" },
  { key: "game", labelKey: "playground.tab.game" },
];

export default function PlaygroundPage() {
  const initGame = useGameStore((s) => s.initialize);
  const isGameLoaded = useGameStore((s) => s.isLoaded);
  const initGrowth = useGrowthStore((s) => s.initialize);
  const isGrowthLoaded = useGrowthStore((s) => s.isLoaded);
  const { play } = useSound();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("uphero");
  // 던전 진행 중엔 탭바 숨김 — DungeonView 가 화면 전체를 차지
  const upHeroSession = useUpHeroStore((s) => s.currentSession);
  const inUpHeroDungeon =
    tab === "uphero" &&
    upHeroSession != null &&
    (upHeroSession.status === "active" ||
      upHeroSession.status === "paused" ||
      upHeroSession.status === "awaitingChoice");

  useEffect(() => {
    if (!isGameLoaded) initGame();
    if (!isGrowthLoaded) initGrowth();
  }, [isGameLoaded, initGame, isGrowthLoaded, initGrowth]);

  if (!isGameLoaded || !isGrowthLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="skeleton w-32 h-4" />
      </div>
    );
  }

  return (
    <div className={`${inUpHeroDungeon ? "px-0 py-0 pb-0" : "px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+96px)]"} max-w-lg md:max-w-xl lg:max-w-2xl mx-auto`}>
      {/* Underline tabs — 공간 절약 + 진짜 탭 감성.
          typo-caption 으로 크기 축소, underline 으로 active 표시. */}
      {!inUpHeroDungeon && (
        <div
          className="flex gap-1 mb-4"
          style={{ borderBottom: "1px solid rgb(255 255 255 / 0.05)" }}
        >
          {TABS.map(({ key, labelKey }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => { play("select"); setTab(key); }}
                className={`relative px-3 py-2 typo-caption transition-colors ${
                  active
                    ? "text-accent"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t(labelKey)}
                {/* active underline indicator */}
                <span
                  className="absolute left-2 right-2 -bottom-px h-0.5 transition-opacity"
                  style={{
                    background: "var(--accent-primary)",
                    opacity: active ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {tab === "uphero" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[40vh]">
                <div className="skeleton w-32 h-4" />
              </div>
            }
          >
            <UpHeroGame />
          </Suspense>
        )}
        {tab === "archive" && <ArchiveSheet />}
        {tab === "game" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[40vh]">
                <div className="skeleton w-32 h-4" />
              </div>
            }
          >
            <MinigameHome />
          </Suspense>
        )}
      </motion.div>
    </div>
  );
}
