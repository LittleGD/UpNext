"use client";

import { motion } from "framer-motion";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { useCountUp } from "@/hooks/useCountUp";
// Phase 9d-fix — Minigame RoundResult 는 한 번 mount 되고 유저가 "Continue"
//   탭할 때까지 값이 변하지 않는 정적 화면이라 useCountUp 이 적절 (한 번만 0→target).
//   만약 내부 값이 바뀐다면 NumberRoll 이 맞음.

export default function MinigameRoundResult() {
  const { t } = useTranslation();
  const { play } = useSound();
  const currentRound = useMinigameStore((s) => s.currentRound);
  const matchedThisRound = useMinigameStore((s) => s.matchedThisRound);
  const chancesLeft = useMinigameStore((s) => s.chancesLeft);
  const board = useMinigameStore((s) => s.board);
  const continueFromRoundResult = useMinigameStore((s) => s.continueFromRoundResult);

  // matchedThisRound는 이미 store에서 matchedAllRun으로 옮겨진 상태일 수 있음
  // 실제 매치 판정은 board의 isMatched 개수로
  const totalMatched = board.filter((t) => t.isMatched).length / 2;
  const allCleared = board.every((t) => t.isMatched);
  // 부분 성공: 챌린지 카드를 1쌍 이상 매치했으면 런 진행 가능.
  const matchedAnyChallenge = board.some(
    (t) => t.isMatched && t.kind === "challenge",
  );
  const canContinue = matchedAnyChallenge;
  void matchedThisRound;

  // Phase 9d — 스코어 숫자 count-up. hard swap 이면 "몇 개 맞췄지?" 인지 소실.
  //   0 → totalMatched 로 700ms rolling → Up Hero 결산과 동일한 감각.
  const totalMatchedDisplay = useCountUp(totalMatched, 700);
  const chancesLeftDisplay = useCountUp(chancesLeft, 500);

  const headingKey = allCleared ? "minigame.round.cleared" : "minigame.round.failed";

  const handleContinue = () => {
    play("confirm");
    continueFromRoundResult();
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center min-h-[80vh] px-6 gap-6"
    >
      <motion.h2 variants={fadeInUp} className="typo-display text-text-primary text-center">
        {t(headingKey)}
      </motion.h2>

      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-4 w-full max-w-xs">
        <div className="bg-bg-surface rounded-lg p-4 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">
            {t("minigame.summary.totalMatches")}
          </p>
          <p className="typo-heading text-text-primary tabular-nums">
            {totalMatchedDisplay}
          </p>
        </div>
        <div className="bg-bg-surface rounded-lg p-4 grid-border text-center">
          <p className="typo-caption text-text-tertiary mb-1">
            {t("minigame.hud.chances")}
          </p>
          <p className="typo-heading text-text-primary tabular-nums">
            {chancesLeftDisplay}
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="typo-caption text-text-tertiary">
        {t("minigame.hud.round", { current: currentRound, total: 3 })}
      </motion.div>

      <motion.button
        variants={fadeInUp}
        onClick={handleContinue}
        whileTap={{ scale: 0.97 }}
        className={`press-affordance min-h-[48px] px-8 rounded-lg typo-body transition-[background-color,filter] duration-200 ease-out hover:brightness-110 ${
          canContinue
            ? "bg-accent text-bg-primary"
            : "bg-bg-surface text-text-primary grid-border"
        }`}
      >
        {canContinue ? t("minigame.round.continue") : t("minigame.round.endRun")}
      </motion.button>
    </motion.div>
  );
}
