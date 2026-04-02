"use client";

import { useState, useEffect, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import type { ChallengeCard } from "@/types/card";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springBouncy } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle } from "@/i18n";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";

type Phase = "shaking" | "opening" | "revealed" | "absorbing";

interface CardPackOpenerProps {
  onComplete?: () => void;
}

export default function CardPackOpener({ onComplete }: CardPackOpenerProps) {
  const progress = useGameStore((s) => s.progress);
  const openCardPack = useGameStore((s) => s.openCardPack);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [revealedCards, setRevealedCards] = useState<ChallengeCard[]>([]);
  const [phase, setPhase] = useState<Phase>("shaking");
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    addTimer(() => {
      const cards = openCardPack();
      if (cards.length === 0) {
        onComplete?.();
        return;
      }
      setRevealedCards(cards);
      setPhase("opening");
      play("packOpen");
      addTimer(() => {
        setPhase("revealed");
        cards.forEach((_, i) => {
          setTimeout(() => play("cardFlip"), i * 120);
        });
      }, 600);
    }, 1400);

    return () => clearAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = () => {
    play("xpGain");
    setPhase("absorbing");

    // Play collect sound as each card reaches the nav bar
    revealedCards.forEach((_, i) => {
      addTimer(() => play("collect"), i * 80 + 700);
    });

    addTimer(() => {
      const remaining = progress.pendingPacks || 0;
      if (remaining > 0) {
        setRevealedCards([]);
        setPhase("shaking");
        addTimer(() => {
          const cards = openCardPack();
          if (cards.length === 0) {
            onComplete?.();
            return;
          }
          setRevealedCards(cards);
          setPhase("opening");
          play("packOpen");
          addTimer(() => {
            setPhase("revealed");
            cards.forEach((_, i) => {
              setTimeout(() => play("cardFlip"), i * 120);
            });
          }, 600);
        }, 1400);
      } else {
        onComplete?.();
      }
    }, 1200);
  };

  // 카드 리빌 + 흡수 상태
  if ((phase === "opening" || phase === "revealed" || phase === "absorbing") && revealedCards.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4 relative">
        {/* 박스가 열리는 연출 */}
        <motion.div
          initial={{ scale: 1 }}
          animate={{ scale: 0.6, y: -40, opacity: 0.3 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          <PixelIcon name="Gift" size={64} color="var(--accent-primary)" />
        </motion.div>

        {/* 타이틀 */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: phase === "absorbing" ? 0 : 1,
            y: phase === "absorbing" ? -20 : 0,
          }}
          transition={{ delay: phase === "absorbing" ? 0 : 0.2, duration: 0.3 }}
          className="text-heading-1 text-accent text-center"
        >
          {t("cards.pack.newCards")}
        </motion.h2>

        {/* 카드들 */}
        <div className="flex gap-4 justify-center relative">
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
                    : { ...springBouncy, delay: 0.1 + i * 0.15 }
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
                  className="text-[min(13px,3vw)] font-bold px-1.5 py-0.5 rounded-sm self-start"
                  style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
                >
                  {rarityLabel(card.rarity, language)}
                </span>

                {/* 아이콘 */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: phase === "absorbing" ? 0 : 1 }}
                  transition={{ ...springBouncy, delay: 0.4 + i * 0.15 }}
                  style={{ color: rarity.color }}
                >
                  <PixelIcon name={card.icon} size={36} />
                </motion.div>

                {/* 제목 */}
                <p className="text-sm font-semibold text-text-primary text-center leading-tight">
                  {cardTitle(card, language)}
                </p>

                {/* 카테고리 */}
                <p className="text-[13px] text-text-tertiary capitalize">
                  {card.category}
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
              className="text-caption text-center"
            >
              {t("cards.pack.addedToCollection")}
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: revealedCards.length * 0.15 + 0.5 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDone}
              className="px-8 py-3 bg-accent text-bg-primary rounded-md font-semibold text-base"
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
      {/* 박스 아이콘 — 자동 흔들림 */}
      <motion.div
        animate={{
          rotate: [0, -8, 8, -8, 8, -5, 5, 0],
          scale: [1, 1.1, 1.1, 1.1, 1.1, 1.05, 1.05, 1.15],
        }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        className="relative"
      >
        <div className="relative">
          <PixelIcon name="Gift" size={56} color="var(--accent-primary)" />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0, 0.6, 0.2] }}
            transition={{ duration: 1.2 }}
            className="absolute -inset-4 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)",
              filter: "blur(8px)",
            }}
          />
        </div>

        {/* 파티클 */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: 0, x: 0, opacity: 0, scale: 0 }}
            animate={{
              y: [0, -20 - i * 10],
              x: [(i - 1.5) * 8, (i - 1.5) * 20],
              opacity: [0, 1, 0],
              scale: [0, 1, 0.5],
            }}
            transition={{ duration: 0.8, delay: 0.4 + i * 0.1 }}
            className="absolute top-0 left-1/2"
            style={{
              width: 4,
              height: 4,
              backgroundColor: "var(--accent-primary)",
            }}
          />
        ))}
      </motion.div>

      {/* 텍스트 — 자동 열림 안내 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <h2 className="text-heading-1 text-text-primary">
          {t("cards.pack.arriving")}
        </h2>
        <p className="text-body text-text-secondary mt-1">
          {t("cards.pack.whatsInside")}
        </p>
      </motion.div>
    </div>
  );
}
