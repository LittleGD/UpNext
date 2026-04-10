"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import PixelIcon from "@/components/icons/PixelIcon";
import { useGameStore } from "@/store/useGameStore";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import { MINIGAME_TICKET_CAP } from "@/types/game";
import { fadeInUp, staggerContainer } from "@/lib/motion";

/**
 * 미니게임 홈 — phase="idle" 일 때 표시되는 랜딩 화면.
 * 티켓 카운트, Play 버튼, 통계, 간단한 규칙 설명.
 */
export default function MinigameHome() {
  const { t } = useTranslation();
  const { play } = useSound();
  const router = useRouter();
  const progress = useGameStore((s) => s.progress);
  const startRun = useMinigameStore((s) => s.startRun);

  const tickets = progress.tickets ?? 0;
  const canPlay = tickets > 0;

  const handlePlay = () => {
    if (!canPlay) {
      play("cancel");
      return;
    }
    play("confirm");
    startRun();
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="px-4 py-8 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg mx-auto flex flex-col gap-6"
    >
      {/* 타이틀 */}
      <motion.div variants={fadeInUp} className="text-center">
        <h1 className="typo-display text-text-primary mb-2">{t("minigame.title")}</h1>
        <p className="typo-body text-text-secondary">{t("minigame.subtitle")}</p>
      </motion.div>

      {/* 티켓 카운터 */}
      <motion.div
        variants={fadeInUp}
        className="bg-bg-surface rounded-xl p-5 grid-border flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="text-accent-secondary">
            <PixelIcon name="Coins" size={32} />
          </div>
          <div>
            <p className="typo-caption text-text-tertiary">{t("minigame.tickets.label")}</p>
            <p className="typo-title text-text-primary">
              {t("minigame.tickets.count", { count: tickets })}
              <span className="typo-caption text-text-tertiary ml-1">/ {MINIGAME_TICKET_CAP}</span>
            </p>
          </div>
        </div>
        <motion.button
          onClick={handlePlay}
          whileTap={canPlay ? { scale: 0.95 } : undefined}
          disabled={!canPlay}
          className={`px-6 py-3 rounded-lg typo-body transition-all ${
            canPlay
              ? "bg-accent text-bg-primary hover:brightness-110"
              : "bg-bg-elevated text-text-tertiary cursor-not-allowed"
          }`}
        >
          {t("minigame.play")}
        </motion.button>
      </motion.div>

      {tickets === 0 && (
        <motion.div
          variants={fadeInUp}
          className="bg-bg-surface rounded-xl p-5 grid-border flex flex-col items-center text-center gap-3 -mt-2"
        >
          <div className="text-accent-secondary">
            <PixelIcon name="WarningDiamond" size={28} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="typo-body text-text-primary">
              {t("minigame.tickets.empty")}
            </p>
            <p className="typo-caption text-text-tertiary">
              {t("minigame.tickets.emptyDesc")}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              play("select");
              router.push("/");
            }}
            className="mt-1 px-5 py-2 rounded-lg bg-accent text-bg-primary typo-caption"
          >
            {t("minigame.tickets.goToChallenges")}
          </motion.button>
        </motion.div>
      )}

      {/* 통계 */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <div className="bg-bg-surface rounded-lg p-4 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">{t("minigame.stats.runs")}</p>
          <p className="typo-heading text-text-primary">{progress.minigameRunsPlayed ?? 0}</p>
        </div>
        <div className="bg-bg-surface rounded-lg p-4 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">{t("minigame.stats.best")}</p>
          <p className="typo-heading text-text-primary">{progress.minigameBestMatches ?? 0}</p>
        </div>
      </motion.div>

      {/* 플레이 방법 */}
      <motion.div variants={fadeInUp} className="bg-bg-surface rounded-lg p-4 grid-border">
        <h3 className="typo-caption text-text-primary mb-3">{t("minigame.howToPlay.heading")}</h3>
        <ul className="space-y-2">
          {[
            t("minigame.howToPlay.line1"),
            t("minigame.howToPlay.line2"),
            t("minigame.howToPlay.line3"),
          ].map((line, i) => (
            <li key={i} className="typo-caption text-text-secondary flex gap-2">
              <span className="text-accent flex-shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
