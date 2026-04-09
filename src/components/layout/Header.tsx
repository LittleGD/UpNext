"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
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

      // 단일 레벨업은 즉시 스냅 (펄스로 강조), 다중 레벨업만 RAF 카운트업
      if (end - start <= 1) {
        setDisplayLevel(end);
        return;
      }

      const startTime = performance.now();
      const duration = 800;
      let raf = 0;
      const tick = (now: number) => {
        const p = Math.min((now - startTime) / duration, 1);
        const next = Math.round(start + (end - start) * p);
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

  const equippedTitle = progress.equippedTitleId
    ? ALL_TITLES.find((t) => t.id === progress.equippedTitleId)
    : null;
  const title = equippedTitle
    ? titleName(equippedTitle, language)
    : getTitleForLevel(progress.level, language);
  const titleColor = equippedTitle ? RARITY_CONFIG[equippedTitle.rarity].color : undefined;
  const { current, needed } = getXPProgress(progress.xp || 0, progress.level);
  const progressPercent = needed > 0 ? Math.min((current / needed) * 100, 100) : 0;

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
          <span className="typo-caption text-text-tertiary">
            {current}/{needed} XP
          </span>
        </div>
        {/* XP Progress Bar */}
        <div className="mt-1.5 h-1.5 bg-bg-elevated rounded-sm overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-sm"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </header>
  );
}
