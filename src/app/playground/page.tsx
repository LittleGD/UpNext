"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { motion } from "framer-motion";
import type { DictKey } from "@/i18n";

const MinigameHome = lazy(() => import("@/components/minigame/MinigameHome"));
const UpHeroGame = lazy(() => import("@/components/uphero/UpHeroGame"));

// Phase 8c — 앨범(archive) 은 Collection 페이지로 이동.
//   playground 에는 영웅(진짜 플레이 공간) + 카드매치(미니게임) 만 남김.
//   "갈래?" 질문에 대한 답이 더 명확해짐: 영웅 키우기 / 게임 즐기기.
type Tab = "uphero" | "game";

const TABS: { key: Tab; labelKey: DictKey }[] = [
  { key: "uphero", labelKey: "playground.tab.uphero" },
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
    <div className={`${inUpHeroDungeon ? "px-0 py-0 pb-0" : "px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+96px)]"} max-w-lg md:max-w-xl lg:max-w-2xl mx-auto`}>
      {/* Phase 9a — Collection 과 동일한 sliding underline 탭.
            이전엔 per-button border-opacity 로 두 객체 (A↓/B↑) 가 깜빡였음.
            하나의 밑줄이 옮겨가는 common-fate 지각 + flex-1 균일 width 로 일관성. */}
      {!inUpHeroDungeon && (
        <nav
          className="relative flex items-stretch mb-5"
          style={{ borderBottom: "1px solid rgb(255 255 255 / 0.06)" }}
        >
          {TABS.map(({ key, labelKey }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { play("select"); setTab(key); }}
                className="playground-tab-btn flex-1 py-2.5 typo-body"
                style={{
                  color: active
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  background: "transparent",
                }}
                aria-current={active ? "page" : undefined}
              >
                {t(labelKey)}
              </button>
            );
          })}
          <div
            aria-hidden="true"
            className="absolute bottom-[-1px] h-[2px]"
            style={{
              width: `${100 / TABS.length}%`,
              left: 0,
              background: "var(--accent-primary)",
              transform: `translateX(${TABS.findIndex((t) => t.key === tab) * 100}%)`,
              transition: "transform 240ms cubic-bezier(0.23, 1, 0.32, 1)",
              boxShadow: "0 0 4px color-mix(in srgb, var(--accent-primary) 40%, transparent)",
            }}
          />
          <style jsx>{`
            .playground-tab-btn {
              transition: color 180ms cubic-bezier(0.23, 1, 0.32, 1),
                transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
            }
            .playground-tab-btn:active {
              transform: scale(0.97);
            }
          `}</style>
        </nav>
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
