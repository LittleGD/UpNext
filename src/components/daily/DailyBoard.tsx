"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "@/store/useGameStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { PASS_GRANT_BY_RARITY, PASS_CAP_PER_CATEGORY } from "@/types/uphero";
import { useGrowthStore } from "@/store/useGrowthStore";
import PhotoCaptureModal from "@/components/growth/PhotoCaptureModal";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import { MODE_CARD_COUNT, XP_PER_RARITY } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springSnappy } from "@/lib/motion";
import PixelConfetti from "@/components/effects/PixelConfetti";
import { useSound } from "@/hooks/useSound";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";
import { categoryLabel } from "@/lib/upHeroI18n";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";
import ExtraChallengeBanner from "./ExtraChallengeBanner";
import SuperChallengeBanner from "./SuperChallengeBanner";
import ChallengeConfirmModal from "./ChallengeConfirmModal";

// Phase 13 final review — `categoryLabelKo` 제거. upHeroI18n.ts 의 공용
//   `categoryLabel(category, language)` 헬퍼 사용으로 통일 (i18n 4 언어 지원).

// === Completion celebration ===
function CompletionCard({ phase }: { phase: "daily" | "extra" | "super" }) {
  const progress = useGameStore((s) => s.progress);
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springSnappy}
      className="rounded-lg bg-accent overflow-hidden relative"
    >
      <div className="flex flex-col items-center justify-center py-10 px-6 relative z-20">
        {/* Floating particles — reduced-motion 시 숨김 (멀미/전정장애 배려) */}
        {!reducedMotion && [...Array(6)].map((_, i) => {
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
  const reducedMotion = useReducedMotion();
  const [confirmCard, setConfirmCard] = useState<ChallengeCard | null>(null);
  // Portal mount 가드 (SSR safe)
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  const [showConfetti, setShowConfetti] = useState(false);
  const [completingCard, setCompletingCard] = useState<ChallengeCard | null>(null);
  const [completingXp, setCompletingXp] = useState(0);
  /**
   * Phase 12 bugfix — 챌린지 완료 시 탐험권 지급 피드백 추가.
   *   유저 제보: "챌린지를 마쳤는데 던전 티켓을 주지 않아".
   *   실제 지급은 정상 (useGameStore.completeChallenge → grantExpeditionPass) 이나
   *   UI 피드백 없어 유저가 지급 여부 인지 못함. 여기서 실제 grant 량 + cap 여부
   *   계산 후 celebration overlay 에 표시.
   */
  const [completingPass, setCompletingPass] = useState<{
    amount: number;
    category: import("@/types/card").Category;
    capped: boolean;
  } | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState<"extra" | "super" | null>(null);
  const [shakeCount, setShakeCount] = useState(0);
  const [captureCard, setCaptureCard] = useState<ChallengeCard | null>(null);
  const startCapture = useGrowthStore((s) => s.startCapture);
  const capturePhase = useGrowthStore((s) => s.capturePhase);
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

  // 챌린지 완료 + 셀레브레이션 공통 로직
  const finishChallenge = useCallback((card: ChallengeCard) => {
    const xp = XP_PER_RARITY[card.rarity] || 10;
    setCompletingCard(card);
    setCompletingXp(xp);
    // Phase 12 bugfix — 탐험권 지급 피드백. 지급 전 현재 passes 읽어 cap 체크.
    //   grant = PASS_GRANT_BY_RARITY[rarity] (normal:1, rare:2, unique:3, legend:3).
    //   current + grant > 20 면 일부만 지급 (cap), 그 경우 capped=true.
    const heroState = useUpHeroStore.getState();
    const currentPasses = heroState.passes[card.category] ?? 0;
    const expectedGrant = PASS_GRANT_BY_RARITY[card.rarity] ?? 1;
    const actualGrant = Math.min(
      expectedGrant,
      PASS_CAP_PER_CATEGORY - currentPasses,
    );
    setCompletingPass({
      amount: actualGrant,
      category: card.category,
      capped: currentPasses + expectedGrant > PASS_CAP_PER_CATEGORY,
    });
    play("complete");
    setTimeout(() => play("xpGain"), 280);
    handleCompleteAction(card.id);

    const willBeAllDone = completedCount + 1 >= totalCount;

    setTimeout(() => {
      setCompletingCard(null);
      setCompletingPass(null);
      if (willBeAllDone) {
        setTimeout(() => play("fullClear"), 100);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
      }
    }, 1200);
  }, [completedCount, totalCount, play, handleCompleteAction]);

  // "완료" — 사진 없이 바로 완료
  const handleConfirm = () => {
    if (confirmCard) {
      const card = confirmCard;
      setConfirmCard(null);
      finishChallenge(card);
    }
  };

  // "기록 남기기" — 사진 캡처 후 완료
  const handleConfirmWithPhoto = () => {
    if (confirmCard) {
      setCaptureCard(confirmCard);
      startCapture(confirmCard.id);
      setConfirmCard(null);
    }
  };

  // 사진 캡처 완료 후 챌린지 완료 처리
  const handleCaptureComplete = useCallback(() => {
    if (!captureCard) return;
    finishChallenge(captureCard);
    setCaptureCard(null);
  }, [captureCard, finishChallenge]);

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
              /* Phase 12 R5 — 키보드 탭 유저가 카드 focus 를 즉시 인지할 수
                   있도록 `:focus-visible` ring 추가. mouse/touch 는 기본 focus
                   링 없이 자연스럽게 눌림. outline-offset -2 로 rounded-2xl
                   경계 안쪽에 떠서 디자인 해치지 않음. aria-label 은 title
                   prop 으로 접근성 보조. */
              title={cardTitle(card, language)}
              aria-pressed={isCompleted}
              aria-label={
                isCompleted
                  ? t("daily.card.ariaCompleted", { title: cardTitle(card, language) })
                  : t("daily.card.ariaComplete", { title: cardTitle(card, language) })
              }
              className={`
                daily-card-btn relative w-full text-left rounded-2xl overflow-hidden transition-colors
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
                        // Phase 9c — scale 0 → 0.4 (Emil 원칙)
                        initial={{ scale: 0.4, rotate: -45, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
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

      {/* Confirm modal — Portal 로 헤더 stacking context escape */}
      {portalReady && createPortal(
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
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
              onClick={() => setConfirmCard(null)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl overflow-hidden relative"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                {/* Rarity accent line */}
                <div
                  className="h-[2px] w-full"
                  style={{
                    background: `linear-gradient(90deg, transparent 5%, ${rarity.color} 50%, transparent 95%)`,
                  }}
                />

                {/* Content — 아이콘 + 타이틀(+XP) + 설명 + 3 stack 액션 (primary/secondary/cancel) */}
                <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center">
                  {/* Icon */}
                  <div style={{ color: rarity.color }} className="mb-4">
                    <PixelIcon name={confirmCard.icon} size={32} />
                  </div>

                  {/* Title + XP (한 줄에 묶음) */}
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <h3 className="typo-heading text-text-primary leading-snug">
                      {cardTitle(confirmCard, language)}
                    </h3>
                    <span
                      className="typo-micro tabular-nums px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${rarity.color}15`, color: rarity.color }}
                    >
                      +{xp} XP
                    </span>
                  </div>

                  {/* Description */}
                  <p className="typo-caption text-text-tertiary mt-2 leading-relaxed">
                    {cardDesc(confirmCard, language)}
                  </p>

                  {/* 액션 영역 — 위에서 아래로 우선순위:
                      ① Primary: 사진으로 인증하고 완료 (accent, 명확한 챌린지 완료 의도)
                      ② Secondary: 사진없이 완료 (gray button, "Done" 의 모호함 해소)
                      ③ Cancel: 취소 (text link 보다 살짝 약한 inline 버튼) */}
                  <div className="w-full mt-6 flex flex-col gap-2">
                    {/* ① Primary — 명시적 완료 의도 ("기록"이 아닌 "완료") */}
                    <button
                      onClick={handleConfirmWithPhoto}
                      className="w-full py-3.5 rounded-xl bg-accent text-bg-primary typo-body transition-transform active:scale-[0.97] flex items-center justify-center gap-2"
                    >
                      <PixelIcon name="Camera" size={16} color="var(--bg-primary)" />
                      {t("daily.confirm.completeWithPhoto")}
                    </button>

                    {/* ② Secondary — 사진 없이 완료 (BUTTON 스타일, "Done" 모호함 제거) */}
                    <button
                      onClick={handleConfirm}
                      className="w-full py-3 rounded-xl bg-bg-surface text-text-secondary typo-body transition-transform active:scale-[0.97]"
                    >
                      {t("daily.confirm.completeWithoutPhoto")}
                    </button>

                    {/* ③ Cancel — 가장 약함 (X 버튼 대신 모달 하단에 명시적으로) */}
                    <button
                      onClick={() => { play("select"); setConfirmCard(null); }}
                      className="w-full py-2.5 typo-caption text-text-tertiary active:text-text-secondary transition-colors"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
        </AnimatePresence>,
        document.body,
      )}

      {/* Completion celebration overlay — Phase 12 bugfix:
            PhotoCaptureModal z-[100] 가 celebration z-50 을 exit 애니메이션 중 덮어
            써서 "완료 화면이 안 뜬다" 제보. Portal + z-[200] 로 올려 항상 최상위 보장.
            (AnimatePresence 는 유지 — enter/exit 애니 정상 동작.) */}
      {typeof window !== "undefined" && createPortal(
        <AnimatePresence>
        {completingCard && (() => {
          const rarity = RARITY_CONFIG[completingCard.rarity];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
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

              {/* Radiating particles — reduced-motion 시 숨김 */}
              {!reducedMotion && [...Array(8)].map((_, i) => {
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

              {/* Center content.
                   Phase 9c — scale 0 → 0.4 (Emil 원칙). */}
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                className="flex flex-col items-center text-center relative"
              >
                {/* Check icon with glow */}
                <motion.div
                  initial={{ scale: 0.4, rotate: -90, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
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
                {/* Phase 12 bugfix — 탐험권 지급 chip. 유저가 "던전 티켓 안 주네" 오인
                     하지 않도록 명시. 실제 지급량 기준 (cap 도달 시 0). */}
                {completingPass && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.45, duration: 0.4, ease: "easeOut" }}
                    className="mt-2 flex items-center gap-2 px-4 py-1.5 rounded-full"
                    style={{
                      backgroundColor: completingPass.amount > 0
                        ? `${rarity.color}15`
                        : "rgba(200,100,60,0.15)",
                    }}
                  >
                    <PixelIcon
                      name="Target"
                      size={14}
                      color={
                        completingPass.amount > 0
                          ? "var(--accent-primary)"
                          : "#e88b7a"
                      }
                    />
                    <span
                      className="typo-caption"
                      style={{
                        color:
                          completingPass.amount > 0
                            ? "var(--accent-primary)"
                            : "#e88b7a",
                      }}
                    >
                      {completingPass.amount > 0
                        ? t("daily.pass.granted", {
                            amount: completingPass.amount,
                            category: categoryLabel(completingPass.category, language),
                          })
                        : t("daily.pass.capped", {
                            category: categoryLabel(completingPass.category, language),
                          })}
                    </span>
                  </motion.div>
                )}

                {/* Floating +XP particles going up — reduced-motion 시 숨김 */}
                {!reducedMotion && [...Array(4)].map((_, i) => (
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
        </AnimatePresence>,
        document.body,
      )}

      {/* Photo capture modal.
           Phase 11a-fix — `capturePhase !== "idle"` 가드 제거.
             savePhoto 완료 직후 capturePhase 가 idle 로 돌아가면서 이 조건이 false
             가 되어 PhotoCaptureModal 전체가 unmount → 그 안의 PhotoDetailModal 까지
             사라져 사용자가 확인 버튼을 누르기 전에 닫힘. 결과적으로 onComplete 가
             never fire → 챌린지가 completed 목록에 안 들어가고 XP 도 안 오름.
             이제는 captureCard 기준으로만 render, PhotoCaptureModal 안에서 savedMeta
             또는 capturePhase 에 따라 알아서 null 처리. */}
      {captureCard && (
        <PhotoCaptureModal
          card={captureCard}
          onComplete={handleCaptureComplete}
        />
      )}
    </motion.div>
  );
}
