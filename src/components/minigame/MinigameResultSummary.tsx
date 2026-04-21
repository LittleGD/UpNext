"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useGameStore } from "@/store/useGameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import PixelConfetti from "@/components/effects/PixelConfetti";

/**
 * 런 최종 요약 화면 — phase=runComplete.
 * 통계 표시 + Play Again / Exit.
 */
export default function MinigameResultSummary() {
  const { t } = useTranslation();
  const { play } = useSound();
  const runStats = useMinigameStore((s) => s.runStats);
  const startRun = useMinigameStore((s) => s.startRun);
  const exitRun = useMinigameStore((s) => s.exitRun);
  const tickets = useGameStore((s) => s.progress.tickets);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setConfetti(true), 200);
    return () => clearTimeout(id);
  }, []);

  const handlePlayAgain = () => {
    if ((tickets ?? 0) <= 0) {
      play("cancel");
      return;
    }
    play("confirm");
    startRun();
  };

  const handleExit = () => {
    play("select");
    exitRun();
  };

  const canPlayAgain = (tickets ?? 0) > 0;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center min-h-[80vh] px-6 gap-6 relative"
    >
      <PixelConfetti trigger={confetti} />
      <motion.h2 variants={fadeInUp} className="typo-display text-text-primary text-center">
        {t("minigame.summary.heading")}
      </motion.h2>

      <motion.div variants={fadeInUp} className="grid grid-cols-3 gap-3 w-full max-w-sm">
        <div className="bg-bg-surface rounded-lg p-3 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">
            {t("minigame.summary.totalMatches")}
          </p>
          <p className="typo-heading text-text-primary">{runStats.totalMatches}</p>
        </div>
        <div className="bg-bg-surface rounded-lg p-3 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">
            {t("minigame.summary.skillMatches")}
          </p>
          <p className="typo-heading text-accent-secondary">{runStats.skillMatches}</p>
        </div>
        <div className="bg-bg-surface rounded-lg p-3 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">
            {t("minigame.summary.curseMatches")}
          </p>
          <p className="typo-heading text-accent-fushia">{runStats.curseMatches}</p>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handlePlayAgain}
          disabled={!canPlayAgain}
          aria-disabled={!canPlayAgain}
          className={`press-affordance min-h-[48px] px-4 rounded-lg typo-body transition-[background-color,filter] duration-200 ease-out ${
            canPlayAgain
              ? "bg-accent text-bg-primary hover:brightness-110"
              : "bg-bg-elevated text-text-tertiary cursor-not-allowed"
          }`}
        >
          {t("minigame.summary.playAgain")}
          {canPlayAgain && ` (${tickets})`}
        </button>
        <button
          onClick={handleExit}
          className="press-affordance min-h-[48px] px-4 rounded-lg bg-bg-surface text-text-primary typo-body transition-[background-color] duration-200 ease-out hover:brightness-110"
        >
          {t("minigame.summary.exit")}
        </button>
      </motion.div>
    </motion.div>
  );
}
