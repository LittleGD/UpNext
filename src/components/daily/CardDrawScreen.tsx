"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { MODE_CARD_COUNT, PHASE_MIN_CARDS, PHASE_MAX_CARDS } from "@/types/game";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import type { ChallengeCard } from "@/types/card";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springSnappy, springBouncy, cardOverlayEnter, cardOverlayExit } from "@/lib/motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";
import { categoryLabel } from "@/data/titles";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";
import Card3DViewer from "@/components/cards/Card3DViewer";
import RarityBackdrop from "@/components/cards/RarityBackdrop";

const SWIPE_UP_THRESHOLD = -100;
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
  const drawPhaseCards = useGameStore((s) => s.drawPhaseCards);
  const selectPhaseCard = useGameStore((s) => s.selectPhaseCard);
  const deselectPhaseCard = useGameStore((s) => s.deselectPhaseCard);
  const confirmPhaseSelection = useGameStore((s) => s.confirmPhaseSelection);

  const { play } = useSound();
  const { t, language } = useTranslation();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLg = useMediaQuery("(min-width: 1024px)");
  const reducedMotion = useReducedMotion();

  // phase-aware 데이터 선택
  const phase = daily.challengePhase || "daily";
  const phaseDrawnCards = phase === "extra" ? daily.extraDrawnCards
    : phase === "super" ? daily.superDrawnCards
    : daily.drawnCards;
  const phaseSelectedCards = phase === "extra" ? daily.extraSelectedCards
    : phase === "super" ? daily.superSelectedCards
    : daily.selectedCards;
  const phaseIsDrawComplete = phase === "extra" ? daily.extraDrawComplete
    : phase === "super" ? daily.superDrawComplete
    : daily.isDrawComplete;

  // daily: 정확히 MODE_CARD_COUNT장, extra/super: 최대 6장 (최소 PHASE_MIN_CARDS)
  const maxCards = phase === "daily" ? MODE_CARD_COUNT[progress.mode] : PHASE_MAX_CARDS[phase];
  const minCards = phase === "daily" ? MODE_CARD_COUNT[progress.mode] : PHASE_MIN_CARDS[phase];
  const selectedCount = phaseSelectedCards.length;
  const isSelectionFull = selectedCount >= maxCards;

  const [previewId, setPreviewId] = useState<string | null>(null);
  // 프리뷰 카드 exit 방향 — "up" = 선택 확정(위로 날아감), "down" = 취소(아래로 사라짐).
  // 이전에는 "위로 가는 모션"과 "아래로 가는 모션"이 동일해서 유저가 선택/취소를
  // 시각적으로 구분할 수 없었음. 방향 기반 exit 애니메이션으로 해소.
  const [previewExitDir, setPreviewExitDir] = useState<"up" | "down" | null>(null);
  // exit 진행 여부를 ref로 추적. ref를 쓰는 이유: setState 업데이터 안에서 side effect를
  // 일으키면 React 동시 렌더링/StrictMode 2중 호출로 setTimeout이 중복 실행될 위험이 있어
  // 일반 setter + 외부 ref 가드 패턴이 안전함.
  const previewExitingRef = useRef(false);
  const previewExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRerollConfirm, setShowRerollConfirm] = useState(false);
  const handScrollRef = useRef<HTMLDivElement>(null);

  // 덱 홀드 인터랙션 상태
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);
  const didDrawRef = useRef(false);

  // 핸드 스크롤을 중앙으로 초기화
  useEffect(() => {
    const el = handScrollRef.current;
    if (el && phaseIsDrawComplete && !isSelectionFull) {
      requestAnimationFrame(() => {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      });
    }
  }, [phaseIsDrawComplete, isSelectionFull]);

  // 프리뷰 exit는 `animate` prop을 이용해 처리. AnimatePresence의 `exit` prop은
  // unmount 직전의 마지막 렌더 시점 값을 캡처하므로, prop을 변경하고 같은 렌더 사이클에
  // unmount 하면 구 값이 캡처될 수 있음. mount된 상태에서 animate 타깃을 바꾼 뒤
  // fixed timeout 후 unmount 하는 방식이 타이밍에 무관하게 안정적임.
  const PREVIEW_EXIT_MS = 320;

  const dismissPreview = useCallback(() => {
    if (previewExitingRef.current) return; // 이미 exit 진행 중 — 무시
    previewExitingRef.current = true;
    setPreviewExitDir("down");
    previewExitTimerRef.current = setTimeout(() => {
      setPreviewId(null);
      setPreviewExitDir(null);
      previewExitingRef.current = false;
      previewExitTimerRef.current = null;
    }, PREVIEW_EXIT_MS);
  }, []);

  const handlePreview = useCallback(
    (cardId: string) => {
      if (isSelectionFull) return;
      if (previewExitingRef.current) return; // exit 중에는 새 프리뷰 열지 않음
      play("cardPreview");
      setPreviewExitDir(null);
      setPreviewId(cardId);
    },
    [isSelectionFull, play]
  );

  const handleConfirmCard = useCallback(
    (card: ChallengeCard) => {
      if (phaseSelectedCards.some((c) => c.id === card.id)) return;
      if (previewExitingRef.current) return; // 이미 exit 진행 중 — 중복 방지
      previewExitingRef.current = true;
      play("cardSelect");
      setPreviewExitDir("up");
      previewExitTimerRef.current = setTimeout(() => {
        if (phase === "daily") {
          selectCard(card);
        } else {
          selectPhaseCard(card);
        }
        setPreviewId(null);
        setPreviewExitDir(null);
        previewExitingRef.current = false;
        previewExitTimerRef.current = null;
      }, PREVIEW_EXIT_MS);
    },
    [phaseSelectedCards, selectCard, selectPhaseCard, phase, play]
  );

  // 덱 홀드 핸들러
  const startHold = useCallback(() => {
    // 이미 홀드 중이면 중복 인터벌 생성 방지 (멀티터치/빠른 재누름 대응)
    if (holdTimerRef.current) return;
    didDrawRef.current = false;
    setIsHolding(true);
    setIsShaking(true);
    play("chargeUp");
    holdStartRef.current = Date.now();
    // 로컬 변수에 캡처해 clearInterval이 정확한 인터벌을 타겟팅하도록 함
    // NOTE(perf): 16ms setInterval → setHoldProgress 호출로 매 프레임 리렌더 발생.
    // holdProgress가 인라인 animate props 다수를 구동하므로 MotionValue 전환은 대규모 리팩터 필요.
    // 현재 홀드 인터랙션은 0.8초로 짧아 실사용 체감 영향 미미.
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const p = Math.min(elapsed / HOLD_DURATION, 1);
      setHoldProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        if (holdTimerRef.current === timer) holdTimerRef.current = null;
        // 홀드 완료 → 카드 뽑기 (한 사이클당 1회만)
        if (!didDrawRef.current) {
          didDrawRef.current = true;
          if (phase === "daily") {
            drawDailyCards();
          } else {
            drawPhaseCards();
          }
          for (let i = 0; i < 6; i++) {
            setTimeout(() => play("cardFlip"), i * 80);
          }
        }
        setIsHolding(false);
        setIsShaking(false);
        setHoldProgress(0);
      }
    }, 16);
    holdTimerRef.current = timer;
  }, [drawDailyCards, drawPhaseCards, phase, play]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    setIsShaking(false);
    setHoldProgress(0);
  }, []);

  // cleanup
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (previewExitTimerRef.current) {
        clearTimeout(previewExitTimerRef.current);
        previewExitTimerRef.current = null;
      }
    };
  }, []);

  // ESC 로 프리뷰 닫기 — 접근성: 키보드 유저와 웹 표준 UX
  useEscapeKey(dismissPreview, previewId !== null);

  // 아직 드로우 안 했을 때 — 덱 홀드 인터랙션
  if (!phaseIsDrawComplete) {
    const shakeAmp = holdProgress * 5;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto px-4 select-none relative">
        {/* 텍스트 — 덱 위에 배치 */}
        <div className="text-center mb-10">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, scale: isHolding ? 1.03 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="typo-title text-text-primary"
          >
            {isHolding ? t("daily.draw.holding") : t("daily.draw.title")}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{
              opacity: isHolding ? 0.9 : [0.4, 0.7, 0.4],
            }}
            transition={isHolding ? { duration: 0.2 } : { duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="typo-caption text-text-secondary mt-2"
          >
            {isHolding ? t("daily.draw.holdHint") : t("daily.draw.instruction")}
          </motion.p>
        </div>

        {/* 성스러운 빛줄기 — 화면 바닥에서 덱 중간까지 (reduced-motion 시 숨김) */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2, display: reducedMotion ? "none" : undefined }}>
          {/* 빛줄기 1 — 메인 accent, 중앙에서 살짝 왼쪽 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(50% - 60px)",
              width: 80,
              height: "60%",
              background: "linear-gradient(to top, rgba(205, 245, 100, 0.22) 0%, rgba(205, 245, 100, 0.07) 40%, transparent 100%)",
              filter: "blur(12px)",
              transform: "rotate(-4deg)",
              transformOrigin: "bottom center",
            }}
          />
          {/* 빛줄기 2 — 흰색+베이지, 중앙 메인 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(50% - 30px)",
              width: 70,
              height: "58%",
              background: "linear-gradient(to top, rgba(255, 245, 220, 0.2) 0%, rgba(255, 245, 220, 0.06) 35%, transparent 100%)",
              filter: "blur(14px)",
              transform: "rotate(1deg)",
              transformOrigin: "bottom center",
            }}
          />
          {/* 빛줄기 3 — 순수 흰빛, 중앙에서 약간 오른쪽 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.65, 0.35] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(50% + 10px)",
              width: 60,
              height: "55%",
              background: "linear-gradient(to top, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.05) 35%, transparent 100%)",
              filter: "blur(14px)",
              transform: "rotate(5deg)",
              transformOrigin: "bottom center",
            }}
          />
          {/* 빛줄기 4 — 시안 보조, 오른쪽 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(50% + 55px)",
              width: 45,
              height: "48%",
              background: "linear-gradient(to top, rgba(155, 240, 225, 0.15) 0%, rgba(155, 240, 225, 0.04) 30%, transparent 100%)",
              filter: "blur(10px)",
              transform: "rotate(8deg)",
              transformOrigin: "bottom center",
            }}
          />
          {/* 빛줄기 5 — 따뜻한 베이지, 왼쪽 넓은 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 3.5 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(50% - 110px)",
              width: 55,
              height: "45%",
              background: "linear-gradient(to top, rgba(245, 230, 190, 0.18) 0%, rgba(245, 230, 190, 0.04) 30%, transparent 100%)",
              filter: "blur(10px)",
              transform: "rotate(-8deg)",
              transformOrigin: "bottom center",
            }}
          />
          {/* 빛줄기 6 — 가느다란 accent 오른쪽 끝 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 4.5 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: "calc(50% + 95px)",
              width: 30,
              height: "40%",
              background: "linear-gradient(to top, rgba(205, 245, 100, 0.12) 0%, transparent 100%)",
              filter: "blur(8px)",
              transform: "rotate(11deg)",
              transformOrigin: "bottom center",
            }}
          />
          {/* 바닥 글로우 — 중앙 수렴점 */}
          <div
            style={{
              position: "absolute",
              bottom: -20,
              left: "50%",
              transform: "translateX(-50%)",
              width: 350,
              height: 100,
              background: "radial-gradient(ellipse, rgba(255, 245, 220, 0.15) 0%, rgba(205, 245, 100, 0.08) 40%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />
        </div>

        {/* 덱 영역 — with ambient particles */}
        <motion.div
          animate={isShaking && !reducedMotion ? {
            x: [0, -shakeAmp, shakeAmp, -shakeAmp * 0.6, shakeAmp * 0.6, 0],
          } : {}}
          transition={isShaking && !reducedMotion ? { duration: Math.max(0.2, 0.45 - holdProgress * 0.2), repeat: Infinity } : {}}
          className="relative"
        >
          {/* Ambient radial glow — grows during hold
              NOTE: framer-motion의 animate={{ scale }}가 style.transform을 덮어쓰기 때문에
              `translate(-50%, -50%)` 대신 motion value 키인 x/y를 써야 animate와 composable.
              그렇지 않으면 glow가 left:50% 기준으로 우측에만 렌더되어 뷰포트 밖으로 삐져나온다
              (horizontal scroll 원인). */}
          <motion.div
            animate={{
              opacity: isHolding ? holdProgress * 0.35 : 0.06,
              scale: isHolding ? 0.8 + holdProgress * 1.2 : 1,
            }}
            transition={{ type: "tween", duration: 0.15 }}
            className="absolute pointer-events-none"
            style={{
              width: 280,
              height: 280,
              left: "50%",
              top: "50%",
              x: "-50%",
              y: "-50%",
              background: "radial-gradient(circle, rgba(205, 245, 100, 0.15) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />

          {/* Floating motes — fill empty space (reduced-motion 시 숨김) */}
          {!reducedMotion && [...Array(8)].map((_, i) => (
            <motion.div
              key={`mote-${i}`}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 3,
                height: 3,
                background: i % 3 === 0 ? "var(--accent-primary)" : i % 3 === 1 ? "var(--accent-cyan)" : "rgba(255,255,255,0.5)",
                left: "50%",
                top: "50%",
                filter: "blur(0.5px)",
              }}
              animate={isHolding ? {
                x: 0,
                y: 0,
                opacity: 0.8,
                scale: 0,
              } : {
                x: [
                  Math.cos((i / 8) * Math.PI * 2) * (50 + (i % 3) * 20),
                  Math.cos((i / 8) * Math.PI * 2 + 0.5) * (60 + (i % 3) * 15),
                  Math.cos((i / 8) * Math.PI * 2) * (50 + (i % 3) * 20),
                ],
                y: [
                  Math.sin((i / 8) * Math.PI * 2) * (40 + (i % 3) * 20),
                  Math.sin((i / 8) * Math.PI * 2 + 0.5) * (55 + (i % 3) * 15),
                  Math.sin((i / 8) * Math.PI * 2) * (40 + (i % 3) * 20),
                ],
                opacity: [0.12, 0.3, 0.12],
                scale: 1,
              }}
              transition={isHolding ? {
                duration: 0.4,
                ease: "easeIn",
              } : {
                duration: 4 + i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.3,
              }}
            />
          ))}

          {/* 덱 인터랙션 영역 */}
          <div
            className="relative cursor-pointer"
            onPointerDown={(e) => { e.preventDefault(); startHold(); }}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            style={{ touchAction: "none" }}
          >
            {/* 덱 카드 스택 — deeper spread + breathing */}
            {[4, 3, 2, 1, 0].map((layer) => (
              <motion.div
                key={layer}
                animate={isHolding ? {
                  y: -layer * 7 - holdProgress * 10,
                  x: (layer - 2) * holdProgress * 0.5,
                  rotate: (layer - 2) * holdProgress * 4,
                  scale: 1 + holdProgress * 0.04,
                } : {
                  y: [
                    -layer * 5,
                    -layer * 5 - (4 - layer) * 0.8,
                    -layer * 5,
                  ],
                  x: (layer - 2) * 1.5,
                  rotate: (layer - 2) * 1.5,
                  scale: 1,
                }}
                transition={isHolding ? {
                  type: "spring", stiffness: 400, damping: 25,
                } : {
                  y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: layer * 0.1 },
                  x: { type: "spring", stiffness: 300, damping: 25 },
                  rotate: { type: "spring", stiffness: 300, damping: 25 },
                }}
                className="absolute inset-0"
                style={{ zIndex: layer }}
              >
                <div
                  className="w-[min(110px,24vw)] h-[min(154px,34vw)] md:w-[130px] md:h-[182px] lg:w-[150px] lg:h-[210px] rounded-xl overflow-hidden relative"
                  style={{
                    backgroundColor: `hsl(0, 0%, ${11 + layer * 1.2}%)`,
                    border: layer === 0
                      ? `1px solid rgba(255, 255, 255, ${isHolding ? 0.06 + holdProgress * 0.08 : 0.06})`
                      : "1px solid rgba(255, 255, 255, 0.03)",
                    boxShadow: isHolding
                      ? `0 0 ${12 + holdProgress * 24}px rgba(205, 245, 100, ${holdProgress * 0.3}), 0 ${4 + layer * 2}px ${8 + layer * 4}px rgba(0, 0, 0, 0.3)`
                      : `0 ${2 + layer}px ${6 + layer * 3}px rgba(0, 0, 0, 0.25)`,
                  }}
                >
                  {/* Card back design */}
                  {/* Top edge highlight */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: layer === 0
                      ? "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 30%)"
                      : undefined,
                  }} />
                  {/* Inner border inset */}
                  <div style={{
                    position: "absolute",
                    inset: layer === 0 ? 5 : 4,
                    borderRadius: 6,
                    border: `1px solid rgba(205, 245, 100, ${layer === 0 ? 0.08 : 0.03})`,
                    pointerEvents: "none",
                  }} />
                  {/* Diamond grid pattern */}
                  <div style={{
                    position: "absolute", inset: 0,
                    opacity: layer === 0 ? 0.035 : 0.015,
                    backgroundImage: `
                      linear-gradient(45deg, rgba(205,245,100,1) 25%, transparent 25%),
                      linear-gradient(-45deg, rgba(205,245,100,1) 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, rgba(205,245,100,1) 75%),
                      linear-gradient(-45deg, transparent 75%, rgba(205,245,100,1) 75%)
                    `,
                    backgroundSize: "12px 12px",
                    backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
                    pointerEvents: "none",
                  }} />
                  {/* Corner accents — top-left & bottom-right */}
                  {layer === 0 && (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: "absolute", top: 10, left: 10, opacity: 0.12 }}>
                        <path d="M0 0L16 0L0 16Z" fill="var(--accent-primary)" />
                      </svg>
                      <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: "absolute", bottom: 10, right: 10, opacity: 0.12, transform: "rotate(180deg)" }}>
                        <path d="M0 0L16 0L0 16Z" fill="var(--accent-primary)" />
                      </svg>
                    </>
                  )}
                  {/* Center emblem */}
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {layer === 0 ? (
                      <motion.div
                        animate={isHolding ? {
                          scale: 1 + holdProgress * 0.1,
                          filter: `brightness(${1 + holdProgress * 0.4})`,
                        } : {}}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                      >
                        <PixelIcon name="Card" size={isLg ? 40 : isMd ? 34 : 28} color="var(--accent-primary)" />
                        {/* Small decorative line under icon */}
                        <div style={{
                          width: 20, height: 1,
                          background: "linear-gradient(90deg, transparent, rgba(205,245,100,0.2), transparent)",
                        }} />
                      </motion.div>
                    ) : (
                      /* Faint icon on non-top cards too */
                      <div style={{ opacity: 0.06 }}>
                        <PixelIcon name="Card" size={isLg ? 32 : isMd ? 28 : 22} color="var(--accent-primary)" />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* 크기 예약 div */}
            <div className="w-[min(110px,24vw)] h-[min(154px,34vw)] md:w-[130px] md:h-[182px] lg:w-[150px] lg:h-[210px] relative" />

            {/* 떨어지는 먼지 파티클 (reduced-motion 시 숨김) */}
            {!reducedMotion && [...Array(12)].map((_, i) => {
              const startX = (i - 5.5) * 12 + (i % 2 === 0 ? -3 : 3);
              const size = 1.5 + (i % 3) * 0.8;
              const dur = 3 + (i % 4) * 1.2;
              const delay = i * 0.45;
              const drift = (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 6);
              return (
                <motion.div
                  key={`dust-${i}`}
                  className="absolute pointer-events-none rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: "rgba(255, 255, 255, 0.7)",
                    left: `calc(50% + ${startX}px)`,
                    top: "100%",
                    filter: size > 2 ? "blur(0.5px)" : undefined,
                  }}
                  animate={{
                    y: [0, 60 + (i % 3) * 25, 120 + (i % 4) * 20],
                    x: [0, drift * 0.5, drift],
                    opacity: [0, 0.6, 0],
                  }}
                  transition={{
                    duration: dur,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: delay,
                  }}
                />
              );
            })}
          </div>
        </motion.div>

        {/* Hold progress hint — subtle dot indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHolding ? 1 : 0 }}
          className="flex items-center gap-1.5 mt-8"
        >
          {[0.2, 0.4, 0.6, 0.8, 1].map((threshold, i) => (
            <motion.div
              key={i}
              animate={{
                backgroundColor: holdProgress >= threshold
                  ? "var(--accent-primary)"
                  : "rgba(255,255,255,0.1)",
                scale: holdProgress >= threshold ? [1, 1.3, 1] : 1,
              }}
              transition={{ duration: 0.15 }}
              className="w-1.5 h-1.5 rounded-full"
            />
          ))}
        </motion.div>
      </div>
    );
  }

  const unselectedCards = phaseDrawnCards.filter(
    (c) => !phaseSelectedCards.some((s) => s.id === c.id)
  );
  const selectedCards = phaseSelectedCards;
  const previewCard = previewId
    ? unselectedCards.find((c) => c.id === previewId) ?? null
    : null;

  /* ── 선택 완료: 카드 리뷰 뷰 ── */
  if (isSelectionFull) {
    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col">
        {/* 상단 — Header 높이 확보 */}
        <div className="flex-shrink-0 h-[60px]" />

        {/* 상태 — 축하 모멘트: 헤더도 같이 fade up 로 스토리텔링 시작 */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="text-center pt-2 pb-4 px-4 flex-shrink-0 max-w-md md:max-w-xl lg:max-w-2xl mx-auto w-full"
        >
          <p className="typo-heading text-text-primary">
            {t("daily.select.complete", { count: maxCards })}
          </p>
          <p className="typo-caption mt-1">
            {maxCards > 1 ? t("daily.select.dragHint") : t("daily.select.checkHint")}
          </p>
        </motion.div>

        {/* 카드 가로 스크롤 — 중앙 정렬 캐러셀 */}
        <div className="flex-1 min-h-0 flex items-start justify-center pt-[4vh] w-full">
          <div
            className="w-full flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {/* 왼쪽 여백 — 첫 카드가 중앙에 오도록 */}
            <div className="flex-shrink-0" style={{ width: "calc(50vw - min(120px, 30vw))" }} />
            {selectedCards.map((card, i) => {
              const rarity = RARITY_CONFIG[card.rarity];
              // 축하 모멘트: scale 0.96 에서 시작하는 부드러운 등장 + 스태거 0.09s
              // Emil 원칙: scale(0) 금지 — 아무것도 없는 상태에서 나타나는 듯한 부자연스러움 제거
              const enterInitial = reducedMotion
                ? false
                : { opacity: 0, y: 30, scale: 0.96 };
              const enterAnimate = { opacity: 1, y: 0, scale: 1 };
              return (
                <motion.div
                  key={card.id}
                  initial={enterInitial}
                  animate={enterAnimate}
                  transition={{
                    ...cardOverlayEnter,
                    delay: reducedMotion ? 0 : i * 0.09,
                  }}
                  className="w-[min(240px,60vw)] md:w-[300px] lg:w-[340px] flex-shrink-0 snap-center rounded-xl p-5 md:p-6 flex flex-col gap-3 bg-bg-elevated relative overflow-hidden aspect-[3/4]"
                  style={{ boxShadow: rarityGlow(card.rarity) }}
                >
                  <RarityTexture rarity={card.rarity} />
                  <div className="flex items-center justify-between relative">
                    <span
                      className="typo-micro font-bold px-2 py-0.5 rounded-sm"
                      style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
                    >
                      {rarityLabel(card.rarity, language)}
                    </span>
                    <span className="typo-micro text-text-tertiary capitalize">
                      {categoryLabel(card.category, language)}
                    </span>
                  </div>
                  <div className="flex-1 flex items-center justify-center min-h-0" style={{ color: rarity.color }}>
                    <PixelIcon name={card.icon} size={isLg ? 72 : isMd ? 60 : 52} />
                  </div>
                  <div>
                    {/* 제목: heading, 본문: body (caption 과용 해소) */}
                    <p className="typo-heading text-text-primary leading-tight font-semibold">
                      {cardTitle(card, language)}
                    </p>
                    <p className="typo-body text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                      {cardDesc(card, language)}
                    </p>
                  </div>
                  {/* 개별 카드 취소 버튼 (패널티 카드는 잠금) */}
                  {daily.penaltyCardId === card.id ? (
                    <div className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-md bg-red-500/10 text-red-400 typo-micro mt-1">
                      <PixelIcon name="Lock" size={12} color="#FF4632" />
                      <span>{t("daily.penalty.locked")}</span>
                    </div>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { play("cancel"); phase === "daily" ? deselectCard(card.id) : deselectPhaseCard(card.id); }}
                      className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-md bg-bg-surface text-text-secondary typo-micro mt-1"
                    >
                      <PixelIcon name="Cancel" size={12} />
                      <span>{t("daily.select.deselect")}</span>
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
            {/* 오른쪽 여백 — 마지막 카드가 중앙에 오도록 */}
            <div className="flex-shrink-0" style={{ width: "calc(50vw - min(120px, 30vw))" }} />
          </div>
        </div>

        {/* 확정 버튼 — 하단 고정 (마지막 카드 등장 이후 delay 로 등장하여 "축하 → 결심" 흐름) */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            ease: [0.23, 1, 0.32, 1],
            delay: reducedMotion ? 0 : 0.18 + selectedCards.length * 0.09,
          }}
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-xl lg:max-w-2xl px-6 pb-[calc(env(safe-area-inset-bottom)+80px)] z-20"
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { play("confirm"); phase === "daily" ? confirmSelection() : confirmPhaseSelection(); }}
            className="w-full min-h-[48px] py-3 bg-accent text-bg-primary rounded-md typo-body"
          >
            {t("daily.select.confirmButton")}
          </motion.button>
        </motion.div>
      </div>
    );
  }

  /* ── 카드 선택 중 ── */
  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 선택 상태 — 상단 고정 */}
      <div className="fixed top-[calc(env(safe-area-inset-top)+70px)] left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-xl lg:max-w-2xl z-[2] text-center px-4">
        <p className="typo-caption">
          {t("daily.select.count", { count: selectedCount, max: maxCards })}
        </p>

        {/* 선택된 미니카드 슬롯 */}
        <div className="flex justify-center gap-3 md:gap-4 pt-2">
          {Array.from({ length: phase === "daily" ? maxCards : Math.max(selectedCount, minCards) }).map((_, i) => {
            const card = selectedCards[i];
            const isPenaltyCard = card && daily.penaltyCardId === card.id;
            return card ? (
              <SelectedMiniCard
                key={card.id}
                card={card}
                locked={!!isPenaltyCard}
                onDeselect={(id) => { play("cancel"); phase === "daily" ? deselectCard(id) : deselectPhaseCard(id); }}
              />
            ) : (
              <PlaceholderSlot key={`placeholder-${i}`} />
            );
          })}
        </div>
      </div>

      {/* 안내 텍스트 — 중앙 */}
      {!previewCard && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-[6]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center flex flex-col items-center gap-2"
          >
            {/* 패널티 배너 */}
            {daily.hasPenalty && phase === "daily" && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 mb-2"
              >
                <PixelIcon name="Lock" size={14} color="#FF4632" />
                <p className="typo-caption text-red-400">
                  {t("daily.penalty.banner")}
                </p>
              </motion.div>
            )}

            {phase === "super" ? (
              <p className="typo-heading text-text-primary">
                {t("daily.select.heading", { count: minCards }).split("").map((char, i) => (
                  <motion.span
                    key={i}
                    animate={{
                      y: [0, -1.5, 1.5, -1, 0.5, 0],
                      x: [0, 0.8, -0.8, 0.5, -0.3, 0],
                      rotate: [0, -2, 2, -1, 0],
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.04,
                      ease: "easeInOut",
                    }}
                    style={{ display: "inline-block", whiteSpace: char === " " ? "pre" : undefined }}
                  >
                    {char}
                  </motion.span>
                ))}
              </p>
            ) : (
              <p className="typo-heading text-text-primary">
                {t("daily.select.heading", { count: maxCards })}
              </p>
            )}
            <p className="typo-caption text-text-tertiary">
              {t("daily.select.hint")}
            </p>

            {/* 리롤 버튼 (daily에서만) */}
            {phase === "daily" && !daily.rerollUsed && !daily.isSelectionComplete && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={() => { play("select"); setShowRerollConfirm(true); }}
                className="pointer-events-auto flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-bg-elevated/90 backdrop-blur-md text-text-tertiary hover:text-text-secondary transition-colors grid-border mt-2"
              >
                <PixelIcon name="Reload" size={16} />
                <span className="typo-caption">{t("daily.draw.reroll")}</span>
              </motion.button>
            )}
          </motion.div>
        </div>
      )}

      {/* 프리뷰 카드 — 3D 뷰어 오버레이.
          Detail 모달과 동일한 bg-black/70 + backdrop-blur-md + cardOverlayEnter 사용.
          3 컨텍스트(Detail/Preview/Final) 모션·시각 언어 통일. */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            key="preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={cardTitle(previewCard, language)}
            className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md overflow-hidden"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={dismissPreview}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            {/* 등급별 뒷배경 이펙트 — 카드 뒤에 위치 */}
            <RarityBackdrop rarity={previewCard.rarity} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={
                previewExitDir === "up"
                  ? // 선택 확정: 뷰포트 위로 날아감 (고정 -520px 대신 뷰포트 기반 -70vh 로 디바이스 불문 시각 일관성)
                    { opacity: 0, y: "-70vh", scale: 0.92 }
                  : previewExitDir === "down"
                    ? // 취소: 살짝 아래로 사라짐
                      { opacity: 0, y: "28vh", scale: 0.88 }
                    : { opacity: 1, y: 0, scale: 1 }
              }
              transition={
                previewExitDir
                  ? { duration: 0.32, ease: [0.32, 0.72, 0, 1] }
                  : cardOverlayEnter
              }
              exit={{ opacity: 0, scale: 0.97, y: 24, transition: cardOverlayExit }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 flex flex-col items-center gap-4"
            >
              <Card3DViewer card={previewCard} language={language} variant="preview" />
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: previewExitDir ? 0 : 1, y: previewExitDir ? 10 : 0 }}
                transition={{ delay: previewExitDir ? 0 : 0.2, duration: 0.2 }}
                whileTap={{ scale: 0.97 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (previewExitDir) return;
                  handleConfirmCard(previewCard);
                }}
                className="flex items-center gap-2 px-8 min-h-[48px] py-3 bg-accent text-bg-primary rounded-md typo-body"
              >
                <PixelIcon name="ArrowUp" size={16} />
                <span>{t("daily.select.selectCard")}</span>
              </motion.button>
            </motion.div>
          </motion.div>
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
              className="w-full max-w-sm bg-bg-elevated rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-center gap-2">
                <PixelIcon name="Reload" size={24} color="var(--accent-primary)" />
                <h3 className="typo-heading text-text-primary">{t("daily.draw.reroll")}</h3>
              </div>
              <p className="typo-body text-text-secondary text-center whitespace-pre-line">
                {t("daily.draw.rerollConfirm")}
              </p>
              <div className="flex justify-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { play("select"); setShowRerollConfirm(false); }}
                  className="px-6 min-h-[48px] py-3 rounded-md bg-bg-surface text-text-secondary typo-body"
                >
                  {t("common.cancel")}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    play("packOpen");
                    // 진행 중인 프리뷰 exit 타이머 취소
                    if (previewExitTimerRef.current) {
                      clearTimeout(previewExitTimerRef.current);
                      previewExitTimerRef.current = null;
                    }
                    previewExitingRef.current = false;
                    setPreviewExitDir(null);
                    rerollCards();
                    setShowRerollConfirm(false);
                    setPreviewId(null);
                    // Play card flip sounds for new cards
                    for (let i = 0; i < 6; i++) {
                      setTimeout(() => play("cardFlip"), i * 80);
                    }
                  }}
                  className="px-6 min-h-[48px] py-3 rounded-md bg-accent text-bg-primary typo-body"
                >
                  {t("daily.draw.reroll")}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 하단: 카드 핸드 */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-0 right-0 z-[5]">
        <div
          ref={handScrollRef}
          className="overflow-x-auto overflow-y-visible scrollbar-hide pt-[50vh] -mt-[50vh] pb-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex items-end gap-0 w-fit mx-auto px-4 md:px-8">
            {unselectedCards.map((card, i) => {
              const isPreview = previewId === card.id;

              return (
                <HandCard
                  key={card.id}
                  card={card}
                  index={i}
                  isPreview={isPreview}
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

    </div>
  );
}

/* ── 핸드 카드 (수평 스크롤) ── */
function HandCard({
  card,
  index,
  isPreview,
  isDimmed,
  disabled,
  onTap,
  onSwipeUp,
}: {
  card: ChallengeCard;
  index: number;
  isPreview: boolean;
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
        y: isPreview ? -20 : 0,
        scale: isPreview ? 1.05 : 1,
        opacity: isPreview ? 0 : isDimmed ? 0.35 : 1,
      }}
      transition={{ ...springBouncy, delay: index * 0.08 }}
      style={{
        y: isPreview ? undefined : y,
        scale: isPreview ? undefined : scale,
        zIndex: isPreview ? 50 : index,
        marginLeft: index === 0 ? 0 : "clamp(-16px, -1.5vw, -6px)",
        touchAction: "pan-x",
        boxShadow: rarityGlow(card.rarity),
      }}
      drag={!disabled || isPreview ? "y" : false}
      dragConstraints={{ top: -160, bottom: 20 }}
      dragElastic={0.4}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      onClick={onTap}
      onHoverStart={() => { if (!disabled && !isPreview) play("cardHover"); }}
      whileHover={!disabled && !isPreview ? { y: -8, transition: { type: "spring", stiffness: 400, damping: 20 } } : {}}
      className="w-[clamp(80px,18vw,120px)] h-[clamp(112px,25vw,168px)] md:w-[140px] md:h-[196px] lg:w-[160px] lg:h-[224px] flex-shrink-0 snap-center rounded-xl p-2 md:p-3 flex flex-col items-center justify-between bg-bg-elevated grid-border cursor-pointer active:cursor-grabbing relative overflow-hidden"
      whileTap={{ scale: 0.97 }}
    >
      <RarityTexture rarity={card.rarity} />
      <span
        className="typo-micro font-bold px-1.5 py-0.5 rounded-sm self-start leading-tight relative"
        style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
      >
        {rarityLabel(card.rarity, language)}
      </span>
      <div className="flex-1 flex items-center justify-center" style={{ color: rarity.color }}>
        <PixelIcon name={card.icon} size={iconSize} />
      </div>
      <p className="typo-micro text-text-tertiary text-center leading-tight truncate w-full">
        {cardTitle(card, language)}
      </p>
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
  locked = false,
}: {
  card: ChallengeCard;
  onDeselect: (id: string) => void;
  locked?: boolean;
}) {
  const rarity = RARITY_CONFIG[card.rarity];
  const { language } = useTranslation();
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 60], [1, locked ? 1 : 0.4]);
  const scale = useTransform(y, [0, 60], [1, locked ? 1 : 0.9]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (locked) return;
      if (y.get() > 50 || info.velocity.y > 300) {
        onDeselect(card.id);
      }
    },
    [y, card.id, onDeselect, locked]
  );

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.15, ease: [0.32, 0, 0.67, 0] } }}
      transition={springSnappy}
      className="flex flex-col items-center gap-1"
    >
      <motion.div
        style={{ y, opacity, scale, boxShadow: locked ? "0 0 12px rgba(255,70,50,0.3)" : rarityGlow(card.rarity) }}
        drag={locked ? false : "y"}
        dragConstraints={{ top: 0, bottom: 80 }}
        dragElastic={0.3}
        dragSnapToOrigin
        onDragEnd={handleDragEnd}
        onClick={() => !locked && onDeselect(card.id)}
        className={`w-16 h-[5.5rem] md:w-20 md:h-[6.875rem] lg:w-24 lg:h-[8.25rem] rounded-md flex flex-col items-center justify-center gap-1 bg-bg-elevated grid-border relative overflow-hidden ${locked ? "" : "cursor-pointer active:cursor-grabbing"}`}
      >
        <RarityTexture rarity={card.rarity} borderRadius={6} />
        {/* 잠금 오버레이 */}
        {locked && (
          <div className="absolute inset-0 bg-red-500/[0.06] z-10 flex items-start justify-end p-1">
            <PixelIcon name="Lock" size={10} color="#FF4632" />
          </div>
        )}
        <PixelIcon name={card.icon} size={22} color={locked ? "#FF4632" : rarity.color} />
        <span className="typo-micro text-text-secondary truncate w-full text-center px-1">
          {cardTitle(card, language)}
        </span>
      </motion.div>
      {locked ? (
        <div className="h-11 flex items-center justify-center">
          <div className="w-7 h-7 rounded-sm bg-bg-surface/50 flex items-center justify-center">
            <PixelIcon name="Lock" size={12} color="#FF4632" />
          </div>
        </div>
      ) : (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onDeselect(card.id)}
          // 시각 크기는 28px 유지, 실제 히트 영역은 44×44 (Apple HIG 최소치)
          className="w-11 h-11 flex items-center justify-center"
          aria-label="deselect card"
        >
          <div className="w-7 h-7 rounded-sm bg-bg-surface flex items-center justify-center">
            <PixelIcon name="Cancel" size={14} color="var(--text-secondary)" />
          </div>
        </motion.button>
      )}
    </motion.div>
  );
}
