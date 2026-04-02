"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { MODE_CARD_COUNT } from "@/types/game";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import type { ChallengeCard } from "@/types/card";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springSnappy, springBouncy } from "@/lib/motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";

const SWIPE_UP_THRESHOLD = -100;
const SWIPE_DOWN_THRESHOLD = 80;
const HOLD_DURATION = 800; // ms

/* ── 메인 컴포넌트 ── */
export default function CardDrawScreen() {
  const daily = useGameStore((s) => s.daily);
  const progress = useGameStore((s) => s.progress);
  const drawDailyCards = useGameStore((s) => s.drawDailyCards);
  const rerollCards = useGameStore((s) => s.rerollCards);
  const selectCard = useGameStore((s) => s.selectCard);
  const deselectCard = useGameStore((s) => s.deselectCard);
  const confirmSelection = useGameStore((s) => s.confirmSelection);

  const { play } = useSound();
  const { t, language } = useTranslation();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLg = useMediaQuery("(min-width: 1024px)");

  const maxCards = MODE_CARD_COUNT[progress.mode];
  const selectedCount = daily.selectedCards.length;
  const isSelectionFull = selectedCount >= maxCards;

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [flyingId, setFlyingId] = useState<string | null>(null);
  const [showRerollConfirm, setShowRerollConfirm] = useState(false);
  const handScrollRef = useRef<HTMLDivElement>(null);

  // 덱 홀드 인터랙션 상태
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);

  // 핸드 스크롤을 중앙으로 초기화
  useEffect(() => {
    const el = handScrollRef.current;
    if (el && daily.isDrawComplete && !isSelectionFull) {
      requestAnimationFrame(() => {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      });
    }
  }, [daily.isDrawComplete, isSelectionFull]);

  const dismissPreview = useCallback(() => setPreviewId(null), []);

  const handlePreview = useCallback(
    (cardId: string) => {
      if (isSelectionFull) return;
      play("cardPreview");
      setPreviewId((prev) => (prev === cardId ? null : cardId));
    },
    [isSelectionFull, play]
  );

  const handleConfirmCard = useCallback(
    (card: ChallengeCard) => {
      if (daily.selectedCards.some((c) => c.id === card.id)) return;
      play("cardSelect");
      setFlyingId(card.id);
      setTimeout(() => {
        selectCard(card);
        setPreviewId(null);
        setFlyingId(null);
      }, 300);
    },
    [daily.selectedCards, selectCard]
  );

  // 덱 홀드 핸들러
  const startHold = useCallback(() => {
    setIsHolding(true);
    setIsShaking(true);
    play("chargeUp");
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const p = Math.min(elapsed / HOLD_DURATION, 1);
      setHoldProgress(p);
      if (p >= 1) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        // 홀드 완료 → 카드 뽑기
        drawDailyCards();
        for (let i = 0; i < 6; i++) {
          setTimeout(() => play("cardFlip"), i * 80);
        }
        setIsHolding(false);
        setIsShaking(false);
        setHoldProgress(0);
      }
    }, 16);
  }, [drawDailyCards]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    setIsHolding(false);
    setIsShaking(false);
    setHoldProgress(0);
  }, []);

  // cleanup
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  // 아직 드로우 안 했을 때 — 덱 홀드 인터랙션
  if (!daily.isDrawComplete) {
    return (
      <motion.div
        animate={isShaking ? { x: [0, -3, 3, -2, 2, -1, 1, 0] } : {}}
        transition={isShaking ? { duration: 0.4, repeat: Infinity } : {}}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-8 max-w-lg md:max-w-xl lg:max-w-2xl mx-auto px-4 select-none"
      >
        {/* 덱 비주얼 */}
        <div
          className="relative cursor-pointer"
          onPointerDown={(e) => { e.preventDefault(); startHold(); }}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          style={{ touchAction: "none" }}
        >
          {/* 덱 카드 스택 */}
          {[4, 3, 2, 1, 0].map((layer) => (
            <motion.div
              key={layer}
              animate={{
                y: isHolding ? -layer * 6 - holdProgress * 8 : -layer * 4,
                rotate: isHolding ? (layer - 2) * holdProgress * 3 : (layer - 2) * 0.5,
                scale: isHolding ? 1 + holdProgress * 0.03 : 1,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="absolute inset-0"
              style={{ zIndex: layer }}
            >
              <div
                className="w-[min(100px,22vw)] h-[min(140px,31vw)] md:w-[120px] md:h-[168px] lg:w-[140px] lg:h-[196px] rounded-lg bg-bg-elevated grid-border flex items-center justify-center"
                style={{
                  boxShadow: isHolding
                    ? `0 ${4 + layer * 2}px ${12 + layer * 4}px rgba(205, 245, 100, ${0.05 + holdProgress * 0.1})`
                    : `0 ${2 + layer}px ${4 + layer * 2}px rgba(0, 0, 0, 0.2)`,
                }}
              >
                {layer === 0 && (
                  <PixelIcon name="Card" size={isLg ? 48 : isMd ? 42 : 36} color="var(--accent-primary)" />
                )}
              </div>
            </motion.div>
          ))}
          {/* 진행도 링 */}
          <div className="w-[min(100px,22vw)] h-[min(140px,31vw)] md:w-[120px] md:h-[168px] lg:w-[140px] lg:h-[196px] relative">
            {isHolding && (
              <svg
                className="absolute -inset-3 pointer-events-none"
                viewBox="0 0 126 166"
              >
                <rect
                  x="3" y="3" width="120" height="160" rx="12"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="2"
                  strokeDasharray={`${(120 + 160) * 2}`}
                  strokeDashoffset={`${(120 + 160) * 2 * (1 - holdProgress)}`}
                  opacity={0.8}
                  style={{ transition: "stroke-dashoffset 0.05s linear" }}
                />
              </svg>
            )}
          </div>

          {/* 홀드 시 글로우 이펙트 */}
          <AnimatePresence>
            {isHolding && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: holdProgress * 0.6, scale: 1 + holdProgress * 0.3 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute -inset-8 rounded-2xl pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at center, var(--accent-primary)${Math.round(holdProgress * 20).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* 텍스트 */}
        <div className="text-center">
          <motion.h2
            animate={{ scale: isHolding ? 1.02 : 1 }}
            className="text-heading-1 text-text-primary"
          >
            {isHolding ? t("daily.draw.holding") : t("daily.draw.title")}
          </motion.h2>
          <p className="text-body text-text-secondary mt-2">
            {isHolding ? t("daily.draw.holdHint") : t("daily.draw.instruction")}
          </p>
        </div>
      </motion.div>
    );
  }

  const unselectedCards = daily.drawnCards.filter(
    (c) => !daily.selectedCards.some((s) => s.id === c.id)
  );
  const selectedCards = daily.selectedCards;
  const previewCard = previewId
    ? unselectedCards.find((c) => c.id === previewId) ?? null
    : null;

  /* ── 선택 완료: 카드 리뷰 뷰 ── */
  if (isSelectionFull) {
    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col">
        {/* 상단 — Header 높이 확보 */}
        <div className="flex-shrink-0 h-[60px]" />

        {/* 상태 */}
        <div className="text-center pt-2 pb-4 px-4 flex-shrink-0 max-w-md md:max-w-xl lg:max-w-2xl mx-auto w-full">
          <p className="text-heading-2 text-text-primary">
            {t("daily.select.complete", { count: maxCards })}
          </p>
          <p className="text-caption mt-1">
            {maxCards > 1 ? t("daily.select.dragHint") : t("daily.select.checkHint")}
          </p>
        </div>

        {/* 카드 가로 스크롤 — 중앙 정렬 캐러셀 */}
        <div className="flex-1 min-h-0 flex items-start justify-center pt-[4vh] w-full">
          <div
            className="w-full flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {/* 왼쪽 여백 — 첫 카드가 중앙에 오도록 */}
            <div className="flex-shrink-0" style={{ width: "calc(50vw - min(120px, 30vw))" }} />
            {selectedCards.map((card) => {
              const rarity = RARITY_CONFIG[card.rarity];
              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springSnappy}
                  className="w-[min(240px,60vw)] md:w-[300px] lg:w-[340px] flex-shrink-0 snap-center rounded-lg p-5 md:p-6 flex flex-col gap-3 bg-bg-elevated grid-border-accent"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[13px] font-bold px-2 py-0.5 rounded-sm"
                      style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
                    >
                      {language === "en" ? rarity.label : rarity.labelKo}
                    </span>
                    <span className="text-[13px] text-text-tertiary capitalize">
                      {language === "en" ? card.category : card.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-center py-5 md:py-6" style={{ color: rarity.color }}>
                    <PixelIcon name={card.icon} size={isLg ? 64 : isMd ? 56 : 48} />
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary text-base md:text-lg leading-tight">
                      {cardTitle(card, language)}
                    </p>
                    <p className="text-sm md:text-base text-text-secondary mt-1">
                      {cardDesc(card, language)}
                    </p>
                  </div>
                  {/* 개별 카드 취소 버튼 */}
                  <button
                    onClick={() => { play("cancel"); deselectCard(card.id); }}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-md bg-bg-surface text-text-secondary text-sm mt-1"
                  >
                    <PixelIcon name="Cancel" size={12} />
                    <span>{t("daily.select.deselect")}</span>
                  </button>
                </motion.div>
              );
            })}
            {/* 오른쪽 여백 — 마지막 카드가 중앙에 오도록 */}
            <div className="flex-shrink-0" style={{ width: "calc(50vw - min(120px, 30vw))" }} />
          </div>
        </div>

        {/* 확정 버튼 — 하단 고정 */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-xl lg:max-w-2xl px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] z-20">
          <button
            onClick={() => { play("confirm"); confirmSelection(); }}
            className="w-full py-3 bg-accent text-bg-primary rounded-md font-semibold text-base"
          >
            {t("daily.select.confirmButton")}
          </button>
        </div>
      </div>
    );
  }

  /* ── 카드 선택 중 ── */
  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 선택 상태 — 상단 고정 */}
      <div className="fixed top-[calc(env(safe-area-inset-top)+70px)] left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-xl lg:max-w-2xl z-[2] text-center px-4">
        <p className="text-caption">
          {t("daily.select.count", { count: selectedCount, max: maxCards })}
        </p>

        {/* 선택된 미니카드 슬롯 */}
        <div className="flex justify-center gap-3 md:gap-4 pt-2">
          {Array.from({ length: maxCards }).map((_, i) => {
            const card = selectedCards[i];
            return card ? (
              <SelectedMiniCard
                key={card.id}
                card={card}
                onDeselect={(id) => { play("cancel"); deselectCard(id); }}
              />
            ) : (
              <PlaceholderSlot key={`placeholder-${i}`} />
            );
          })}
        </div>
      </div>

      {/* 안내 텍스트 — 화면 중앙 고정 */}
      {!previewCard && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-[6]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center flex flex-col items-center gap-3"
          >
            <h2 className="text-heading-2 text-text-primary mb-1">
              {t("daily.select.heading", { count: maxCards })}
            </h2>
            <p className="text-caption">
              {t("daily.select.hint")}
            </p>

            {/* 리롤 버튼 — nav-sized pill */}
            {!daily.rerollUsed && !daily.isSelectionComplete && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={() => { play("select"); setShowRerollConfirm(true); }}
                className="pointer-events-auto flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-bg-elevated/90 backdrop-blur-md text-text-secondary hover:text-accent transition-colors grid-border mt-1"
              >
                <PixelIcon name="Reload" size={18} />
                <span className="text-[13px] font-semibold">{t("daily.draw.reroll")}</span>
              </motion.button>
            )}
            {daily.rerollUsed && (
              <span className="text-[11px] text-text-tertiary mt-1">{t("daily.draw.rerollUsed")}</span>
            )}
          </motion.div>
        </div>
      )}

      {/* 프리뷰 카드 — 오버레이 */}
      <AnimatePresence>
        {previewCard && flyingId !== previewCard.id && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
            onClick={dismissPreview}
          >
            <PreviewCard
              key="preview"
              card={previewCard}
              onConfirm={() => handleConfirmCard(previewCard)}
              onDismiss={dismissPreview}
            />
          </div>
        )}
      </AnimatePresence>

      {/* 리롤 확인 모달 */}
      <AnimatePresence>
        {showRerollConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setShowRerollConfirm(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={springSnappy}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-bg-elevated rounded-lg p-6 space-y-4"
            >
              <div className="flex items-center justify-center gap-2">
                <PixelIcon name="Reload" size={24} color="var(--accent-primary)" />
                <h3 className="font-semibold text-text-primary text-lg">{t("daily.draw.reroll")}</h3>
              </div>
              <p className="text-body text-text-secondary text-center whitespace-pre-line">
                {t("daily.draw.rerollConfirm")}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowRerollConfirm(false)}
                  className="px-6 py-3 rounded-md bg-bg-surface text-text-secondary font-semibold"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={() => {
                    play("packOpen");
                    rerollCards();
                    setShowRerollConfirm(false);
                    setPreviewId(null);
                    // Play card flip sounds for new cards
                    for (let i = 0; i < 6; i++) {
                      setTimeout(() => play("cardFlip"), i * 80);
                    }
                  }}
                  className="px-6 py-3 rounded-md bg-accent text-bg-primary font-semibold"
                >
                  {t("daily.draw.reroll")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 하단: 카드 핸드 */}
      {(() => {
        return (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-0 right-0 z-[5]">
            <div
              ref={handScrollRef}
              className="overflow-x-auto overflow-y-visible scrollbar-hide pt-[50vh] -mt-[50vh] pb-1"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="flex items-end gap-0 w-fit mx-auto px-4 md:px-8">
              {unselectedCards.map((card, i) => {
                const isPreview = previewId === card.id;
                const isFlying = flyingId === card.id;

                return (
                  <HandCard
                    key={card.id}
                    card={card}
                    index={i}
                    isPreview={isPreview}
                    isFlying={isFlying}
                    isDimmed={false}
                    disabled={isSelectionFull}
                    onTap={() => {
                      if (isPreview) {
                        handleConfirmCard(card);
                      } else {
                        handlePreview(card.id);
                      }
                    }}
                    onSwipeUp={() => {
                      if (isPreview) {
                        handleConfirmCard(card);
                      } else {
                        handlePreview(card.id);
                      }
                    }}
                  />
                );
              })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── 핸드 카드 (수평 스크롤) ── */
function HandCard({
  card,
  index,
  isPreview,
  isFlying,
  isDimmed,
  disabled,
  onTap,
  onSwipeUp,
}: {
  card: ChallengeCard;
  index: number;
  isPreview: boolean;
  isFlying: boolean;
  isDimmed: boolean;
  disabled: boolean;
  onTap: () => void;
  onSwipeUp: () => void;
}) {
  const rarity = RARITY_CONFIG[card.rarity];
  const { language } = useTranslation();
  const { play } = useSound();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLg = useMediaQuery("(min-width: 1024px)");
  const iconSize = isLg ? 40 : isMd ? 34 : 28;
  const y = useMotionValue(0);
  const scale = useTransform(y, [0, -80], [1, 1.02]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (disabled && !isPreview) return;
      const currentY = y.get();
      if (currentY < SWIPE_UP_THRESHOLD || info.velocity.y < -400) {
        onSwipeUp();
      }
    },
    [y, disabled, isPreview, onSwipeUp]
  );

  return (
    <motion.div
      initial={{ y: 200, opacity: 0 }}
      animate={{
        y: isFlying ? -600 : isPreview ? -20 : 0,
        scale: isFlying ? 0.8 : isPreview ? 1.05 : 1,
        opacity: isFlying ? 0 : isPreview ? 0 : isDimmed ? 0.35 : 1,
      }}
      transition={{ ...springBouncy, delay: index * 0.08 }}
      style={{
        y: isPreview || isFlying ? undefined : y,
        scale: isPreview ? undefined : scale,
        zIndex: isPreview ? 50 : index,
        marginLeft: index === 0 ? 0 : "clamp(-16px, -1.5vw, -6px)",
        touchAction: "pan-x",
      }}
      drag={!disabled || isPreview ? "y" : false}
      dragConstraints={{ top: -160, bottom: 20 }}
      dragElastic={0.4}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      onClick={onTap}
      onHoverStart={() => { if (!disabled && !isPreview && !isFlying) play("cardHover"); }}
      whileHover={!disabled && !isPreview && !isFlying ? { y: -8, transition: { type: "spring", stiffness: 400, damping: 20 } } : {}}
      className="w-[clamp(80px,18vw,120px)] h-[clamp(112px,25vw,168px)] md:w-[140px] md:h-[196px] lg:w-[160px] lg:h-[224px] flex-shrink-0 snap-center rounded-lg p-2 md:p-3 flex flex-col items-center justify-between bg-bg-elevated grid-border cursor-pointer active:cursor-grabbing"
      whileTap={{ scale: 1.05 }}
    >
      <span
        className="text-[10px] md:text-[12px] lg:text-[13px] font-bold px-1.5 py-0.5 rounded-sm self-start leading-tight"
        style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
      >
        {language === "en" ? rarity.label : rarity.labelKo}
      </span>
      <div className="flex-1 flex items-center justify-center" style={{ color: rarity.color }}>
        <PixelIcon name={card.icon} size={iconSize} />
      </div>
      <p className="text-[11px] md:text-[13px] lg:text-sm font-medium text-text-tertiary text-center leading-tight truncate w-full">
        {cardTitle(card, language)}
      </p>
    </motion.div>
  );
}

/* ── 프리뷰 카드 (중앙 확대) ── */
function PreviewCard({
  card,
  onConfirm,
  onDismiss,
}: {
  card: ChallengeCard;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const rarity = RARITY_CONFIG[card.rarity];
  const { t, language } = useTranslation();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLg = useMediaQuery("(min-width: 1024px)");
  const y = useMotionValue(0);
  const cardScale = useTransform(y, [0, -100], [1, 1.05]);
  const cardOpacity = useTransform(y, [0, -140], [1, 0.6]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const currentY = y.get();
      // 위로 밀기 → 선택
      if (currentY < SWIPE_UP_THRESHOLD || info.velocity.y < -400) {
        onConfirm();
      }
      // 3. 아래로 내리기 → 손으로 복귀
      if (currentY > SWIPE_DOWN_THRESHOLD || info.velocity.y > 300) {
        onDismiss();
      }
    },
    [y, onConfirm, onDismiss]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 120, scale: 0.7 }}
      transition={springSnappy}
      style={{ y, scale: cardScale, opacity: cardOpacity }}
      drag="y"
      dragConstraints={{ top: -180, bottom: 140 }}
      dragElastic={0.35}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      onClick={(e) => {
        e.stopPropagation(); // 카드 클릭이 배경으로 전파되지 않게
        onConfirm();
      }}
      className="w-[min(240px,60vw)] md:w-[300px] lg:w-[340px] rounded-lg p-5 md:p-6 flex flex-col gap-3 bg-bg-elevated grid-border-accent cursor-grab active:cursor-grabbing"
    >
      {/* 스와이프 힌트 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-center gap-1 text-[13px] text-text-tertiary"
      >
        <PixelIcon name="ArrowUp" size={14} />
        <span>{t("daily.select.swipeHint")}</span>
      </motion.div>

      <div className="flex items-center justify-between">
        <span
          className="text-[13px] font-bold px-2 py-0.5 rounded-sm"
          style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
        >
          {language === "en" ? rarity.label : rarity.labelKo}
        </span>
        <span className="text-[13px] text-text-tertiary capitalize">
          {card.category}
        </span>
      </div>

      <div className="flex items-center justify-center py-5 md:py-6" style={{ color: rarity.color }}>
        <PixelIcon name={card.icon} size={isLg ? 64 : isMd ? 56 : 48} />
      </div>

      <div>
        <p className="font-semibold text-text-primary text-base md:text-lg leading-tight">
          {cardTitle(card, language)}
        </p>
        <p className="text-sm md:text-base text-text-secondary mt-1">
          {cardDesc(card, language)}
        </p>
      </div>
    </motion.div>
  );
}

/* ── 빈 플레이스홀더 슬롯 ── */
function PlaceholderSlot() {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-16 h-[5.5rem] md:w-20 md:h-[6.875rem] lg:w-24 lg:h-[8.25rem] rounded-md border-2 border-dashed border-white/10 flex items-center justify-center">
        <PixelIcon name="Plus" size={18} color="var(--text-tertiary)" />
      </div>
      <div className="h-7" />
    </div>
  );
}

/* ── 선택된 미니 카드 ── */
function SelectedMiniCard({
  card,
  onDeselect,
}: {
  card: ChallengeCard;
  onDeselect: (id: string) => void;
}) {
  const rarity = RARITY_CONFIG[card.rarity];
  const { language } = useTranslation();
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 60], [1, 0.4]);
  const scale = useTransform(y, [0, 60], [1, 0.9]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (y.get() > 50 || info.velocity.y > 300) {
        onDeselect(card.id);
      }
    },
    [y, card.id, onDeselect]
  );

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={springSnappy}
      className="flex flex-col items-center gap-1"
    >
      <motion.div
        style={{ y, opacity, scale }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 80 }}
        dragElastic={0.3}
        dragSnapToOrigin
        onDragEnd={handleDragEnd}
        onClick={() => onDeselect(card.id)}
        className="w-16 h-[5.5rem] md:w-20 md:h-[6.875rem] lg:w-24 lg:h-[8.25rem] rounded-md flex flex-col items-center justify-center gap-1 bg-bg-elevated grid-border cursor-pointer active:cursor-grabbing"
      >
        <PixelIcon name={card.icon} size={22} color={rarity.color} />
        <span className="text-[11px] md:text-[12px] text-text-secondary truncate w-full text-center px-1">
          {cardTitle(card, language)}
        </span>
      </motion.div>
      <button
        onClick={() => onDeselect(card.id)}
        className="w-7 h-7 rounded-sm bg-bg-surface flex items-center justify-center"
      >
        <PixelIcon name="Cancel" size={14} color="var(--text-secondary)" />
      </button>
    </motion.div>
  );
}
