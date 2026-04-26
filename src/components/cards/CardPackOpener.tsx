"use client";

import { useState, useEffect, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import type { ChallengeCard, Rarity } from "@/types/card";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springBouncy } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle } from "@/i18n";
import { categoryLabel } from "@/lib/upHeroI18n";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";

type Phase = "shaking" | "opening" | "revealed" | "absorbing";

interface CardPackOpenerProps {
  onComplete?: () => void;
}

/**
 * 등급별 오픈 연출 스펙. tier 가 올라갈수록 화려해진다.
 *  - shakeMs: 흔들림 단계 길이 — 더 길수록 긴장감 ↑
 *  - particleCount: shake 단계 파티클 수
 *  - revealStaggerMs: 카드 등장 시간차 (legend 일수록 느릿하게 한 장씩)
 *  - flashIntensity: opening 시 풀스크린 플래시 (0=없음, 1=강)
 *  - haloRings: 등장 시 박스 주변 확장링 수
 */
const PACK_FX: Record<Rarity, {
  shakeMs: number;
  particleCount: number;
  revealStaggerMs: number;
  flashIntensity: number;
  haloRings: number;
}> = {
  normal: { shakeMs: 1200, particleCount: 4, revealStaggerMs: 120, flashIntensity: 0, haloRings: 0 },
  rare:   { shakeMs: 1600, particleCount: 7, revealStaggerMs: 140, flashIntensity: 0.25, haloRings: 1 },
  unique: { shakeMs: 2000, particleCount: 11, revealStaggerMs: 170, flashIntensity: 0.5, haloRings: 2 },
  legend: { shakeMs: 2500, particleCount: 16, revealStaggerMs: 210, flashIntensity: 0.85, haloRings: 3 },
};

export default function CardPackOpener({ onComplete }: CardPackOpenerProps) {
  const progress = useGameStore((s) => s.progress);
  const openCardPack = useGameStore((s) => s.openCardPack);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [revealedCards, setRevealedCards] = useState<ChallengeCard[]>([]);
  const [packTier, setPackTier] = useState<Rarity>("normal");
  const [phase, setPhase] = useState<Phase>("shaking");
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const fx = PACK_FX[packTier];
  const tierColor = RARITY_CONFIG[packTier].color;

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // handleDone 재진입 방지 (더블탭/연속탭으로 팩이 중복 소모되는 것 차단)
  const isDoneInFlightRef = useRef(false);

  const addTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  };

  const clearAllTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // 자동 열기: 마운트 시 바로 흔들림 시작 → 카드 리빌
  useEffect(() => {
    // 첫 팩의 tier 를 미리 알기 위해 shake 시작 전에 굴림.
    // openCardPack() 은 한 번만 호출되어야 하므로 결과를 보관 후 phase 전환 시 사용.
    const result = openCardPack();
    if (result.cards.length === 0) {
      onComplete?.();
      return;
    }
    setPackTier(result.tier);
    const initialFx = PACK_FX[result.tier];
    addTimer(() => {
      setRevealedCards(result.cards);
      setPhase("opening");
      play("packOpen");
      addTimer(() => {
        setPhase("revealed");
        result.cards.forEach((_, i) => {
          addTimer(() => play("cardFlip"), i * initialFx.revealStaggerMs);
        });
      }, 600);
    }, initialFx.shakeMs);

    return () => clearAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = () => {
    // 재진입 방지: 이미 진행 중이면 무시
    if (isDoneInFlightRef.current) return;
    isDoneInFlightRef.current = true;

    play("xpGain");
    setPhase("absorbing");

    // Play collect sound as each card reaches the nav bar
    revealedCards.forEach((_, i) => {
      addTimer(() => play("collect"), i * 80 + 700);
    });

    addTimer(() => {
      const remaining = (progress.pendingPacks || 0) + (progress.pendingBonusCards || 0);
      if (remaining > 0) {
        // 다음 팩 굴림 — tier 가 바뀌면 shake 길이/연출도 바뀜
        const next = openCardPack();
        if (next.cards.length === 0) {
          onComplete?.();
          return;
        }
        setRevealedCards([]);
        setPackTier(next.tier);
        setPhase("shaking");
        const nextFx = PACK_FX[next.tier];
        addTimer(() => {
          setRevealedCards(next.cards);
          setPhase("opening");
          play("packOpen");
          addTimer(() => {
            setPhase("revealed");
            // 다음 리빌 라운드 시작 → 확인 버튼 다시 받을 수 있도록 해제
            isDoneInFlightRef.current = false;
            next.cards.forEach((_, i) => {
              addTimer(() => play("cardFlip"), i * nextFx.revealStaggerMs);
            });
          }, 600);
        }, nextFx.shakeMs);
      } else {
        onComplete?.();
      }
    }, 1200);
  };

  // 카드 리빌 + 흡수 상태
  if ((phase === "opening" || phase === "revealed" || phase === "absorbing") && revealedCards.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4 relative">
        {/* 풀스크린 플래시 — opening 첫 순간에 한 번. unique/legend 만 강하게 */}
        {fx.flashIntensity > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={
              phase === "opening"
                ? { opacity: [0, fx.flashIntensity, 0] }
                : { opacity: 0 }
            }
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="fixed inset-0 pointer-events-none z-[60]"
            style={{
              background: `radial-gradient(circle at center, ${tierColor} 0%, transparent 65%)`,
              mixBlendMode: "screen",
            }}
          />
        )}

        {/* 등장 시 박스 주변 확장 링 — tier 별 0~3개 */}
        {fx.haloRings > 0 && phase === "opening" && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {Array.from({ length: fx.haloRings }).map((_, i) => (
              <motion.div
                key={`halo-${i}`}
                initial={{ scale: 0.3, opacity: 0.7 }}
                animate={{ scale: 3 + i * 0.8, opacity: 0 }}
                transition={{ duration: 0.9 + i * 0.15, delay: i * 0.1, ease: "easeOut" }}
                className="absolute rounded-full"
                style={{
                  width: 120,
                  height: 120,
                  border: `2px solid ${tierColor}`,
                  boxShadow: `0 0 24px ${tierColor}`,
                }}
              />
            ))}
          </div>
        )}

        {/* 박스가 열리는 연출 */}
        <motion.div
          initial={{ scale: 1 }}
          animate={{ scale: 0.6, y: -40, opacity: 0.3 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          <PixelIcon name="Gift" size={64} color={tierColor} />
        </motion.div>

        {/* 타이틀 */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: phase === "absorbing" ? 0 : 1,
            y: phase === "absorbing" ? -20 : 0,
          }}
          transition={{ delay: phase === "absorbing" ? 0 : 0.2, duration: 0.3 }}
          className="typo-display text-center"
          style={{ color: tierColor }}
        >
          {t("cards.pack.newCards")}
        </motion.h2>

        {/* 카드들 */}
        <div className="flex gap-4 justify-center relative flex-wrap max-w-[480px]">
          {revealedCards.map((card, i) => {
            const rarity = RARITY_CONFIG[card.rarity];
            return (
              <motion.div
                key={card.id}
                ref={(el) => { cardRefs.current[i] = el; }}
                initial={{ y: 120, scale: 0.3, opacity: 0, rotate: (i - 1) * 15 }}
                animate={
                  phase === "absorbing"
                    ? {
                        y: [0, -120, 300],
                        x: [0, (i - 1) * -40, 0],
                        scale: [1, 0.7, 0.2],
                        opacity: [1, 0.9, 0],
                        rotate: [0, (i - 1) * -60, (i - 1) * -180],
                      }
                    : { y: 0, scale: 1, opacity: 1, rotate: 0 }
                }
                transition={
                  phase === "absorbing"
                    ? { duration: 1.0, ease: [0.4, 0, 0.2, 1], delay: i * 0.08 }
                    : { ...springBouncy, delay: 0.1 + i * (fx.revealStaggerMs / 1000) }
                }
                className="w-[min(110px,28vw)] rounded-lg p-3 flex flex-col items-center gap-2 bg-bg-elevated grid-border relative overflow-visible"
                style={{ boxShadow: rarityGlow(card.rarity) }}
              >
                <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
                  <RarityTexture rarity={card.rarity} />
                </div>
                {/* 흡수 시 형광 꼬리 */}
                {phase === "absorbing" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0.6, 0] }}
                    transition={{ duration: 0.8, delay: i * 0.08 + 0.2 }}
                    className="absolute inset-0 rounded-lg"
                    style={{
                      boxShadow: `0 0 20px ${rarity.color}, 0 0 40px ${rarity.color}80, 0 8px 30px ${rarity.color}40`,
                      background: `linear-gradient(to bottom, transparent, ${rarity.color}30)`,
                    }}
                  />
                )}

                {/* 등급 */}
                <span
                  className="typo-micro font-bold px-1.5 py-0.5 rounded-sm self-start"
                  style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
                >
                  {rarityLabel(card.rarity, language)}
                </span>

                {/* 아이콘 */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: phase === "absorbing" ? 0 : 1 }}
                  transition={{ ...springBouncy, delay: 0.4 + i * (fx.revealStaggerMs / 1000) }}
                  style={{ color: rarity.color }}
                >
                  <PixelIcon name={card.icon} size={36} />
                </motion.div>

                {/* 제목 */}
                <p className="typo-caption font-semibold text-text-primary text-center leading-tight">
                  {cardTitle(card, language)}
                </p>

                {/* 카테고리 */}
                <p className="typo-caption text-text-tertiary capitalize">
                  {categoryLabel(card.category, language)}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* 흡수 시 네비게이션 방향으로 떨어지는 파티클 트레일 */}
        <AnimatePresence>
          {phase === "absorbing" && revealedCards.map((card, i) => {
            const rarity = RARITY_CONFIG[card.rarity];
            return Array.from({ length: 6 }, (_, j) => (
              <motion.div
                key={`trail-${card.id}-${j}`}
                initial={{ opacity: 0, y: 0, x: 0 }}
                animate={{
                  opacity: [0, 0.9, 0],
                  y: [0, -80 + j * 10, 250 + j * 20],
                  x: [(i - 1) * 30, (i - 1) * -20, 0],
                  scale: [0.5, 0.8, 0],
                }}
                transition={{
                  duration: 0.9,
                  delay: i * 0.08 + j * 0.06,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 4 + Math.random() * 4,
                  height: 4 + Math.random() * 4,
                  backgroundColor: rarity.color,
                  boxShadow: `0 0 8px ${rarity.color}, 0 0 16px ${rarity.color}60`,
                  left: "50%",
                  top: "50%",
                }}
              />
            ));
          })}
        </AnimatePresence>

        {/* 안내 + 확인 버튼 */}
        {phase === "revealed" && (
          <>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="typo-caption text-center"
            >
              {t("cards.pack.addedToCollection")}
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: revealedCards.length * (fx.revealStaggerMs / 1000) + 0.5 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDone}
              className="px-8 py-3 bg-accent text-bg-primary rounded-md typo-body"
            >
              {t("common.confirm")}
            </motion.button>
          </>
        )}
      </div>
    );
  }

  // 흔들림 상태 (자동 — 버튼 없음)
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
      {/* legend 일 때 배경 펄스 — 화려함 강조 */}
      {packTier === "legend" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.25, 0, 0.18, 0] }}
          transition={{ duration: fx.shakeMs / 1000, repeat: 0, ease: "easeInOut" }}
          className="fixed inset-0 pointer-events-none z-[55]"
          style={{
            background: `radial-gradient(circle at center, ${tierColor} 0%, transparent 70%)`,
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* 박스 아이콘 — 자동 흔들림. tier 가 높을수록 더 길고 흔들림 강도 ↑ */}
      <motion.div
        animate={
          packTier === "legend"
            ? { rotate: [0, -14, 14, -12, 12, -10, 10, -8, 8, -5, 5, 0], scale: [1, 1.18, 1.18, 1.18, 1.2, 1.18, 1.18, 1.15, 1.15, 1.1, 1.1, 1.25] }
            : packTier === "unique"
            ? { rotate: [0, -11, 11, -10, 10, -7, 7, -5, 5, 0], scale: [1, 1.15, 1.15, 1.15, 1.18, 1.12, 1.12, 1.08, 1.08, 1.2] }
            : packTier === "rare"
            ? { rotate: [0, -10, 10, -9, 9, -6, 6, 0], scale: [1, 1.12, 1.12, 1.12, 1.14, 1.08, 1.08, 1.18] }
            : { rotate: [0, -8, 8, -8, 8, -5, 5, 0], scale: [1, 1.1, 1.1, 1.1, 1.1, 1.05, 1.05, 1.15] }
        }
        transition={{ duration: fx.shakeMs / 1000, ease: "easeInOut" }}
        className="relative"
      >
        <div className="relative">
          <PixelIcon name="Gift" size={56} color={tierColor} />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0, 0.6, 0.2] }}
            transition={{ duration: fx.shakeMs / 1000 }}
            className="absolute -inset-4 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${tierColor} 0%, transparent 70%)`,
              filter: "blur(8px)",
            }}
          />
        </div>

        {/* 파티클 — tier 별 4 / 7 / 11 / 16개. 위치/속도도 약간씩 차등 */}
        {Array.from({ length: fx.particleCount }).map((_, i) => {
          const angle = (i / fx.particleCount) * Math.PI * 2;
          const distance = 24 + (i % 3) * 12;
          return (
            <motion.div
              key={i}
              initial={{ y: 0, x: 0, opacity: 0, scale: 0 }}
              animate={{
                y: [0, Math.sin(angle) * distance],
                x: [0, Math.cos(angle) * distance],
                opacity: [0, 1, 0],
                scale: [0, 1, 0.4],
              }}
              transition={{ duration: 0.8, delay: 0.3 + (i % 6) * 0.08, repeat: packTier === "legend" ? 1 : 0 }}
              className="absolute top-1/2 left-1/2 rounded-full"
              style={{
                width: packTier === "legend" ? 5 : 4,
                height: packTier === "legend" ? 5 : 4,
                backgroundColor: tierColor,
                boxShadow: `0 0 6px ${tierColor}`,
              }}
            />
          );
        })}
      </motion.div>

      {/* 텍스트 — 자동 열림 안내 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <h2 className="typo-title text-text-primary">
          {t("cards.pack.arriving")}
        </h2>
        <p className="typo-body text-text-secondary mt-1">
          {t("cards.pack.whatsInside")}
        </p>
      </motion.div>
    </div>
  );
}
