"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";
import { useMinigameStore } from "@/store/useMinigameStore";
import { getXPProgress, getTitleForLevel } from "@/types/game";
import { ALL_TITLES } from "@/data/titles";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { titleName } from "@/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import { motion, useAnimationControls } from "framer-motion";

export default function Header() {
  const progress = useGameStore((s) => s.progress);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const minigamePhase = useMinigameStore((s) => s.phase);
  const pathname = usePathname();

  const { language } = useTranslation();

  const level = progress.level;
  const prevLevelRef = useRef(level);
  const [displayLevel, setDisplayLevel] = useState(level);
  const pulseControls = useAnimationControls();

  // 레벨업 시 카운트업 + 펄스 애니메이션
  useEffect(() => {
    if (level > prevLevelRef.current) {
      const start = prevLevelRef.current;
      const end = level;
      prevLevelRef.current = level;
      pulseControls.start({
        scale: [1, 1.25, 1],
        transition: { duration: 0.6, ease: "easeOut" },
      });

      // 카운트업: 시작 값에서 새 값까지 가시적으로 롤링
      // 단일 레벨업(예: 1→2)도 정수 한 단계가 보이도록 약간의 duration 부여
      const delta = end - start;
      const duration = delta <= 1 ? 600 : Math.min(800 + (delta - 1) * 120, 1400);

      // 카운트업이 시작 값에서 출발하도록 즉시 표시값을 start로 리셋
      setDisplayLevel(start);

      const startTime = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const p = Math.min((now - startTime) / duration, 1);
        // easeOutQuad — 끝부분에서 부드럽게 정착
        const eased = 1 - (1 - p) * (1 - p);
        const next = Math.round(start + (end - start) * eased);
        setDisplayLevel(next);
        if (p < 1) {
          raf = requestAnimationFrame(tick);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    prevLevelRef.current = level;
    setDisplayLevel(level);
  }, [level, pulseControls]);

  if (!isLoaded || !hasCompletedOnboarding) return null;

  // 미니게임 런 중에는 몰입 모드: idle이 아닌 모든 phase에서 헤더 숨김
  const inMinigameRun = pathname === "/minigame" && minigamePhase !== "idle";
  if (inMinigameRun) return null;

  const equippedTitle = progress.equippedTitleId
    ? ALL_TITLES.find((t) => t.id === progress.equippedTitleId)
    : null;
  // 레벨 롤링 애니메이션 중에는 displayLevel 기준으로 타이틀/XP 를 렌더해야
  // "Lv.4 에 Lv.5 타이틀/XP" 같은 모순 상태가 노출되지 않는다.
  const isLevelAnimating = displayLevel < progress.level;
  const title = equippedTitle
    ? titleName(equippedTitle, language)
    : getTitleForLevel(displayLevel, language);
  const titleColor = equippedTitle ? RARITY_CONFIG[equippedTitle.rarity].color : undefined;
  const { current, needed } = getXPProgress(progress.xp || 0, progress.level);
  const progressPercent = needed > 0 ? Math.min((current / needed) * 100, 100) : 0;
  // 애니메이션 중에는 XP 바를 "직전 레벨 100%" 로 고정하고, 레벨 동기화 직후
  // Framer Motion 이 새 % 로 부드럽게 감속해 들어가도록 한다. XP 텍스트는 레이아웃
  // 유지를 위해 visibility 만 숨긴다.
  const displayedPercent = isLevelAnimating ? 100 : progressPercent;

  return (
    <header className="sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-md border-b border-white/5 px-4 py-3 pt-[max(env(safe-area-inset-top),12px)]">
      <div className="max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.span
              animate={pulseControls}
              className="font-display typo-heading text-accent inline-block origin-center"
            >
              Lv.{displayLevel}
            </motion.span>
            <span className="typo-body" style={{ color: titleColor || "var(--text-primary)" }}>{title}</span>
          </div>
          <span
            className="typo-caption text-text-tertiary"
            style={{ visibility: isLevelAnimating ? "hidden" : "visible" }}
          >
            {current}/{needed} XP
          </span>
        </div>
        {/* XP Progress Bar */}
        <div className="mt-1.5 h-1.5 bg-bg-elevated rounded-sm overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-sm"
            initial={{ width: 0 }}
            animate={{ width: `${displayedPercent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </header>
  );
}
