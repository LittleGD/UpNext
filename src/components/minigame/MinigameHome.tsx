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
 *
 * Phase 14 design review 변경:
 * - Play CTA 를 티켓 카운트 카드 안의 사이드 버튼에서 분리 — 전체폭 hero CTA 로
 *   승격. 첫 방문자 눈이 "내가 여기서 뭘 해야 하지?" 에 즉시 답하도록 한다.
 * - "How to play" 섹션의 `h3 + typo-caption` 미스매치 수정 → `typo-title` 로
 *   hierarchy 복구. 헤더는 헤더 크기여야 한다.
 * - `transition-all` 범위 제한 → `transition-[background-color,filter]`.
 * - press-affordance 유틸로 버튼 active 상태 일관화.
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
      className="px-4 sm:px-6 py-8 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg mx-auto flex flex-col gap-6"
    >
      {/* 타이틀 */}
      <motion.div variants={fadeInUp} className="text-center">
        <h1 className="typo-display text-text-primary mb-2">{t("minigame.title")}</h1>
        <p className="typo-body text-text-secondary">{t("minigame.subtitle")}</p>
      </motion.div>

      {/* 티켓 카운터 — 이제 read-only 정보 카드 */}
      <motion.div
        variants={fadeInUp}
        className="bg-bg-surface rounded-xl p-5 grid-border flex items-center gap-3"
      >
        <div className="text-accent-secondary">
          <PixelIcon name="Coins" size={32} />
        </div>
        <div className="flex-1">
          <p className="typo-caption text-text-tertiary">{t("minigame.tickets.label")}</p>
          <p className="typo-title text-text-primary">
            {t("minigame.tickets.count", { count: tickets })}
            <span className="typo-caption text-text-tertiary ml-1">
              / {MINIGAME_TICKET_CAP}
            </span>
          </p>
        </div>
      </motion.div>

      {/* Play hero CTA — 전체폭, 48px 높이. 첫 방문자 eye-catch */}
      <motion.button
        variants={fadeInUp}
        onClick={handlePlay}
        whileTap={canPlay ? { scale: 0.97 } : undefined}
        disabled={!canPlay}
        aria-disabled={!canPlay}
        className={`press-affordance w-full min-h-[52px] rounded-xl typo-title font-semibold flex items-center justify-center gap-2 transition-[background-color,filter,color] duration-200 ease-out ${
          canPlay
            ? "bg-accent text-bg-primary hover:brightness-110"
            : "bg-bg-elevated text-text-tertiary cursor-not-allowed"
        }`}
      >
        <PixelIcon name="Play" size={20} />
        <span>{t("minigame.play")}</span>
      </motion.button>

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
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              play("select");
              router.push("/");
            }}
            className="press-affordance mt-1 px-5 min-h-[44px] rounded-lg bg-accent text-bg-primary typo-caption transition-[background-color,filter] duration-200 ease-out hover:brightness-110"
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

      {/* 플레이 방법 — h3 ≠ typo-caption 교정. typo-title 로 헤더 역할 복구 */}
      <motion.div variants={fadeInUp} className="bg-bg-surface rounded-lg p-4 grid-border">
        <h3 className="typo-title text-text-primary mb-3">
          {t("minigame.howToPlay.heading")}
        </h3>
        <ul className="space-y-2">
          {[
            t("minigame.howToPlay.line1"),
            t("minigame.howToPlay.line2"),
            t("minigame.howToPlay.line3"),
          ].map((line, i) => (
            <li key={i} className="typo-caption text-text-secondary flex gap-2">
              <span className="text-accent flex-shrink-0" aria-hidden="true">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
