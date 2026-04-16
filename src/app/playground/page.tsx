"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { motion } from "framer-motion";
import GrowthTree from "@/components/growth/GrowthTree";
import ArchiveSheet from "@/components/growth/ArchiveSheet";
import type { DictKey } from "@/i18n";

const MinigameHome = lazy(() => import("@/components/minigame/MinigameHome"));

type Tab = "tree" | "archive" | "game";

const TABS: { key: Tab; labelKey: DictKey }[] = [
  { key: "tree", labelKey: "playground.tab.tree" },
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
  const [tab, setTab] = useState<Tab>("tree");

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
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
      {/* Pill tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => { play("select"); setTab(key); }}
            className={`flex-1 py-2.5 rounded-md typo-body transition-all ${
              tab === key
                ? "bg-accent text-bg-primary"
                : "bg-bg-surface text-text-secondary"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {tab === "tree" && <GrowthTree />}
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
