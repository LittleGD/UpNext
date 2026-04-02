"use client";

import { useGameStore } from "@/store/useGameStore";
import { getXPProgress, getTitleForLevel } from "@/types/game";
import { ALL_TITLES } from "@/data/titles";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { titleName } from "@/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import { motion } from "framer-motion";

export default function Header() {
  const progress = useGameStore((s) => s.progress);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);

  const { language } = useTranslation();

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
            <span className="font-display text-lg text-accent">Lv.{progress.level}</span>
            <span className="text-sm font-semibold" style={{ color: titleColor || "var(--text-primary)" }}>{title}</span>
          </div>
          <span className="text-xs text-text-tertiary">
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
