"use client";

import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import { MODE_CARD_COUNT, XP_PER_RARITY } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springSnappy } from "@/lib/motion";
import PixelConfetti from "@/components/effects/PixelConfetti";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";
import ExtraChallengeBanner from "./ExtraChallengeBanner";
import SuperChallengeBanner from "./SuperChallengeBanner";
import ChallengeConfirmModal from "./ChallengeConfirmModal";

// === Completion celebration ===
function CompletionCard({ phase }: { phase: "daily" | "extra" | "super" }) {
  const progress = useGameStore((s) => s.progress);
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springSnappy}
      className="rounded-lg bg-accent overflow-hidden relative"
    >
      <div className="flex flex-col items-center justify-center py-10 px-6 relative z-20">
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => {
          // 골든 앵글 기반 결정적 분포 — Math.random() 사용 시 SSR/CSR hydration mismatch 발생
          const angle = (i * 137.5 * Math.PI) / 180;
          const initX = Math.cos(angle) * (60 + (i % 3) * 40);
          const initY = Math.sin(angle) * (30 + (i % 2) * 20);
          const animY1 = Math.cos(angle + 1) * (25 + (i % 3) * 15);
          const animY2 = Math.sin(angle + 2) * (40 + (i % 2) * 20);
          return (
            <motion.div
              key={i}
              className="absolute w-[2px] h-[2px] bg-bg-primary/30 rounded-full"
              initial={{
                x: initX,
                y: initY,
                opacity: 0,
              }}
              animate={{
                y: [animY1, animY2],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                duration: 3 + (i % 3) * 0.8,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeInOut",
              }}
            />
          );
        })}

        {/* Trophy — 정적 렌더 */}
        <div className="relative">
          <PixelIcon name="Trophy" size={64} color="#0A0A0A" />
        </div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="typo-display text-bg-primary mt-3 text-center"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          {phase === "extra" ? t("extra.complete.title")
            : phase === "super" ? t("super.complete.title")
            : t("daily.board.allDoneTitle")}
        </motion.p>

        {/* Streak with counting animation */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex items-center gap-2 mt-2"
        >
          <PixelIcon name="Zap" size={18} color="#0A0A0A" />
          <span className="typo-body text-bg-primary">
            {t("daily.board.streak", { days: progress.currentStreak })}
          </span>
        </motion.div>

        {/* Phase-specific guide message — 상단 헤더의 XP 바와 정보가 겹치므로
            완료 카드 자체에는 레벨/XP 재표시하지 않고 streak 와 안내 문구만 노출 */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="typo-caption text-bg-primary/50 mt-4 text-center whitespace-pre-line leading-relaxed"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          {phase === "extra" ? t("extra.complete.guide")
            : phase === "super" ? t("super.complete.guide")
            : t("daily.board.doneGuide")}
        </motion.p>

      </div>
    </motion.div>
  );
}

export default function DailyBoard() {
  const daily = useGameStore((s) => s.daily);
  const progress = useGameStore((s) => s.progress);
  const completeChallenge = useGameStore((s) => s.completeChallenge);
  const completePhaseChallenge = useGameStore((s) => s.completePhaseChallenge);
  const startExtraChallenge = useGameStore((s) => s.startExtraChallenge);
  const startSuperChallenge = useGameStore((s) => s.startSuperChallenge);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [confirmCard, setConfirmCard] = useState<ChallengeCard | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [completingCard, setCompletingCard] = useState<ChallengeCard | null>(null);
  const [completingXp, setCompletingXp] = useState(0);
  const [showChallengeModal, setShowChallengeModal] = useState<"extra" | "super" | null>(null);
  const [shakeCount, setShakeCount] = useState(0);
  // 배너를 re-mount 해 hold 상태를 초기화하기 위한 key
  // 모달을 cancel 로 닫으면 bump 되어 배너가 새 인스턴스로 교체됨
  const [bannerResetKey, setBannerResetKey] = useState(0);

  // phase-aware 데이터 선택
  const phase = daily.challengePhase || "daily";
  const phaseSelectedCards = phase === "extra" ? daily.extraSelectedCards
    : phase === "super" ? daily.superSelectedCards
    : daily.selectedCards;
  const phaseCompletedIds = phase === "extra" ? daily.extraCompletedIds
    : phase === "super" ? daily.superCompletedIds
    : daily.completedIds;

  const completedCount = phaseCompletedIds.length;
  const totalCount = phaseSelectedCards.length;
  const allDone = totalCount > 0 && completedCount >= totalCount;

  // daily 완료 여부 (extra 배너 표시용)
  const dailyAllDone = daily.selectedCards.length > 0 && daily.completedIds.length >= daily.selectedCards.length;
  // extra 완료 여부 (super 배너 표시용)
  const extraAllDone = (daily.extraSelectedCards?.length ?? 0) > 0 && (daily.extraCompletedIds?.length ?? 0) >= (daily.extraSelectedCards?.length ?? 0);

  const phaseHeading = phase === "extra" ? t("extra.board.heading")
    : phase === "super" ? t("super.board.heading")
    : t("daily.board.heading");

  const handleCompleteAction = (cardId: string) => {
    if (phase === "daily") {
      completeChallenge(cardId);
    } else {
      completePhaseChallenge(cardId);
    }
  };

  const handleConfirm = () => {
    if (confirmCard) {
      // 카드에 명시된 XP 그대로 (배율 없음)
      const xp = XP_PER_RARITY[confirmCard.rarity] || 10;
      // Show success state in modal
      setCompletingCard(confirmCard);
      setCompletingXp(xp);
      setConfirmCard(null);
      play("complete");
      setTimeout(() => play("xpGain"), 280);
      handleCompleteAction(confirmCard.id);

      const willBeAllDone = completedCount + 1 >= totalCount;

      // Dismiss success state after delay
      setTimeout(() => {
        setCompletingCard(null);
        if (willBeAllDone) {
          setTimeout(() => play("fullClear"), 100);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2000);
        }
      }, 1200);
    }
  };

  // 추가 챌린지 확인 핸들러
  const handleExtraConfirm = () => {
    setShowChallengeModal(null);
    play("impactShake");
    setShakeCount(1);
    setTimeout(() => setShakeCount(0), 500);
    startExtraChallenge();
  };

  const handleSuperConfirm = () => {
    setShowChallengeModal(null);
    play("impactShake");
    setShakeCount(2);
    setTimeout(() => {
      play("impactShake");
      setTimeout(() => setShakeCount(0), 500);
    }, 400);
    startSuperChallenge();
  };

  // 모달을 cancel 로 닫으면 배너 key 를 bump 해 re-mount → activated 등 hold state 초기화
  const handleCancelChallengeModal = () => {
    play("cancel");
    setShowChallengeModal(null);
    setBannerResetKey((k) => k + 1);
  };

  return (
    <motion.div
      className="space-y-4"
      animate={shakeCount > 0 ? {
        x: [0, -10, 10, -8, 8, -4, 4, 0],
      } : {}}
      transition={shakeCount > 0 ? {
        duration: 0.4,
        repeat: shakeCount - 1,
        repeatDelay: 0.1,
      } : {}}
    >
      <PixelConfetti trigger={showConfetti} />

      {/* Completion card */}
      {allDone && <CompletionCard phase={phase} />}

      {/* 추가 챌린지 배너 — daily 완료 후, extra 미시작 */}
      {phase === "daily" && dailyAllDone && (
        <ExtraChallengeBanner
          key={`extra-${bannerResetKey}`}
          onPress={() => setShowChallengeModal("extra")}
        />
      )}

      {/* 슈퍼 챌린지 배너 — extra 완료 후, super 미시작 */}
      {phase === "extra" && extraAllDone && (
        <SuperChallengeBanner
          key={`super-${bannerResetKey}`}
          onPress={() => setShowChallengeModal("super")}
        />
      )}

      {/* 챌린지 확인 모달 */}
      <AnimatePresence>
        {showChallengeModal && (
          <ChallengeConfirmModal
            phase={showChallengeModal}
            onConfirm={showChallengeModal === "extra" ? handleExtraConfirm : handleSuperConfirm}
            onCancel={handleCancelChallengeModal}
          />
        )}
      </AnimatePresence>

      {/* Header — compact progress */}
      <div className="flex items-center justify-between">
        <h2 className="typo-title text-text-primary">{phaseHeading}</h2>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalCount }, (_, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              initial={false}
              animate={{
                backgroundColor: i < completedCount ? "var(--accent-primary)" : "var(--bg-elevated)",
                scale: i < completedCount ? [1, 1.3, 1] : 1,
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
          <span className="typo-caption ml-1">
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Challenge cards — large, spacious, refined */}
      <div className="space-y-5">
        {phaseSelectedCards.map((card, index) => {
          const isCompleted = phaseCompletedIds.includes(card.id);
          const rarity = RARITY_CONFIG[card.rarity];
          const xp = XP_PER_RARITY[card.rarity] || 10;

          return (
            <motion.button
              key={card.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileTap={isCompleted ? {} : { scale: 0.97 }}
              onClick={() => {
                if (!isCompleted) {
                  play("select");
                  setConfirmCard(card);
                }
              }}
              className={`
                relative w-full text-left rounded-2xl overflow-hidden transition-colors
                ${isCompleted
                  ? "bg-bg-surface/40"
                  : "bg-bg-elevated hover:bg-bg-hover cursor-pointer"
                }
              `}
              style={!isCompleted ? { boxShadow: rarityGlow(card.rarity) } : undefined}
            >
              {/* Top accent line */}
              <div
                className="h-[2px] w-full"
                style={{
                  background: isCompleted
                    ? "var(--bg-elevated)"
                    : `linear-gradient(90deg, ${rarity.color}00 5%, ${rarity.color} 50%, ${rarity.color}00 95%)`,
                }}
              />

              {/* Rarity texture overlay */}
              {!isCompleted && <RarityTexture rarity={card.rarity} borderRadius={16} />}

              <div className="px-6 pt-6 pb-0 flex flex-col gap-5">
                {/* Top row: icon + meta */}
                <div className="flex items-start justify-between">
                  <div className={`
                    w-[72px] h-[72px] rounded-2xl flex items-center justify-center
                    ${isCompleted ? "bg-accent/10" : "bg-white/[0.04]"}
                  `}>
                    {isCompleted ? (
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      >
                        <PixelIcon name="Check" size={36} color="var(--accent-primary)" />
                      </motion.div>
                    ) : (
                      <div style={{ color: rarity.color }}>
                        <PixelIcon name={card.icon} size={36} />
                      </div>
                    )}
                  </div>

                  {/* Rarity badge + XP */}
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="typo-micro font-bold uppercase tracking-wide px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: isCompleted ? "var(--bg-elevated)" : `${rarity.color}18`,
                        color: isCompleted ? "var(--text-tertiary)" : rarity.color,
                      }}
                    >
                      {rarityLabel(card.rarity, language)}
                    </span>
                    {!isCompleted && (
                      <div className="flex items-center gap-1">
                        <PixelIcon name="Zap" size={14} color="var(--accent-primary)" />
                        <span className="typo-caption text-accent">+{xp}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title + description */}
                <div className="space-y-1.5">
                  <h3
                    className={`typo-heading leading-snug ${
                      isCompleted ? "line-through text-text-tertiary" : "text-text-primary"
                    }`}
                  >
                    {cardTitle(card, language)}
                  </h3>
                  <p className={`typo-caption leading-relaxed ${isCompleted ? "text-text-tertiary" : "text-text-secondary"}`}>
                    {cardDesc(card, language)}
                  </p>
                </div>
              </div>

              {/* CTA bar */}
              <div className={`
                mx-6 mb-5 mt-4 py-3 rounded-xl text-center typo-body transition-colors
                ${isCompleted
                  ? "bg-bg-elevated text-text-tertiary"
                  : "bg-bg-elevated text-accent"
                }
              `}>
                {isCompleted ? (
                  <span className="flex items-center justify-center gap-2">
                    <PixelIcon name="Check" size={16} color="var(--accent-primary)" />
                    {t("daily.board.completed")}
                  </span>
                ) : (
                  <span>{t("daily.board.markDone")}</span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {confirmCard && (() => {
          const rarity = RARITY_CONFIG[confirmCard.rarity];
          const xp = XP_PER_RARITY[confirmCard.rarity] || 10;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
              onClick={() => setConfirmCard(null)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                {/* Rarity accent line */}
                <div
                  className="h-[2px] w-full"
                  style={{
                    background: `linear-gradient(90deg, transparent 5%, ${rarity.color} 50%, transparent 95%)`,
                  }}
                />

                {/* Content */}
                <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center">
                  {/* Icon */}
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                    style={{ backgroundColor: `${rarity.color}12` }}
                  >
                    <div style={{ color: rarity.color }}>
                      <PixelIcon name={confirmCard.icon} size={32} />
                    </div>
                  </div>

                  {/* Title + desc */}
                  <h3 className="typo-heading text-text-primary leading-snug">
                    {cardTitle(confirmCard, language)}
                  </h3>
                  <p className="typo-body text-text-secondary mt-1.5 leading-relaxed">
                    {cardDesc(confirmCard, language)}
                  </p>

                  {/* XP reward badge */}
                  <div className="flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full bg-accent/8">
                    <PixelIcon name="Zap" size={14} color="var(--accent-primary)" />
                    <span className="typo-caption text-accent">+{xp} XP</span>
                  </div>

                  {/* Prompt */}
                  <p className="typo-body text-text-tertiary mt-5">
                    {t("daily.board.confirmPrompt")}
                  </p>

                  {/* Buttons */}
                  <div className="flex w-full gap-3 mt-5">
                    <button
                      onClick={() => { play("select"); setConfirmCard(null); }}
                      className="flex-1 py-3.5 rounded-xl bg-bg-elevated text-text-secondary typo-body transition-colors active:scale-[0.97]"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex-1 py-3.5 rounded-xl bg-accent text-bg-primary typo-body transition-colors active:scale-[0.97]"
                    >
                      {t("common.done")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Completion celebration overlay */}
      <AnimatePresence>
        {completingCard && (() => {
          const rarity = RARITY_CONFIG[completingCard.rarity];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
            >
              {/* Burst ring */}
              <motion.div
                initial={{ scale: 0.3, opacity: 0.8 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 120,
                  height: 120,
                  background: `radial-gradient(circle, ${rarity.color}40 0%, transparent 70%)`,
                }}
              />
              {/* Secondary burst */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0.6 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 80,
                  height: 80,
                  border: `2px solid ${rarity.color}60`,
                }}
              />

              {/* Radiating particles */}
              {[...Array(8)].map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const dist = 80 + (i % 3) * 30;
                return (
                  <motion.div
                    key={`burst-${i}`}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 3,
                      height: 3,
                      background: i % 2 === 0 ? rarity.color : "white",
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist,
                      opacity: 0,
                      scale: 0,
                    }}
                    transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 * i }}
                  />
                );
              })}

              {/* Center content */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                className="flex flex-col items-center text-center relative"
              >
                {/* Check icon with glow */}
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.15 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                  style={{
                    background: `radial-gradient(circle, ${rarity.color}25 0%, transparent 70%)`,
                    boxShadow: `0 0 40px ${rarity.color}20`,
                  }}
                >
                  <PixelIcon name="Check" size={44} color={rarity.color} />
                </motion.div>

                {/* XP gain with counting animation */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full"
                  style={{ backgroundColor: `${rarity.color}15` }}
                >
                  <PixelIcon name="Zap" size={18} color="var(--accent-primary)" />
                  <motion.span
                    className="typo-title text-accent"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: [0.5, 1.2, 1] }}
                    transition={{ delay: 0.35, duration: 0.4 }}
                  >
                    +{completingXp} XP
                  </motion.span>
                </motion.div>

                {/* Floating +XP particles going up */}
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={`xp-float-${i}`}
                    className="absolute typo-caption text-accent/60 pointer-events-none"
                    initial={{ opacity: 0, y: 0, x: (i - 1.5) * 25 }}
                    animate={{ opacity: [0, 0.7, 0], y: -60 - i * 15 }}
                    transition={{ delay: 0.4 + i * 0.12, duration: 0.8, ease: "easeOut" }}
                    style={{ top: 10 }}
                  >
                    +{Math.round(completingXp / 4)}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}
