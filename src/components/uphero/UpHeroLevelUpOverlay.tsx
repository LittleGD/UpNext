"use client";

/**
 * 챌린지 레벨업 시 전역 축하 오버레이.
 *
 * useGameStore.progress.level 증가를 감지해 풀스크린 연출 (파티클 버스트 +
 * 레벨 숫자 스케일-인 + 사운드) 후 2.8 초 후 자동 해제. 탭으로 즉시 해제 가능.
 * 모든 레벨업 경로 (탐험 완료 / idle 보상 / 기타) 를 공통 커버.
 *
 * 온보딩 중 (hasCompletedOnboarding=false) 에는 LevelUpScreen 이 전담하므로
 * 이 오버레이는 비활성화.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { getTitleForLevel } from "@/types/game";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAnnounce } from "@/hooks/useAnnounce";
import PixelIcon from "@/components/icons/PixelIcon";

const PARTICLE_COUNT = 24;
const AUTO_DISMISS_MS = 2800;

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  color: string;
}

function generateParticles(): Particle[] {
  const colors = [
    "var(--accent-primary)",
    "var(--accent-cyan)",
    "var(--accent-secondary)",
    "var(--rarity-legend)",
  ];
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (360 / PARTICLE_COUNT) * i + (Math.random() - 0.5) * 18;
    const rad = (angle * Math.PI) / 180;
    const distance = 90 + Math.random() * 110;
    return {
      id: i,
      x: Math.cos(rad) * distance,
      y: Math.sin(rad) * distance,
      size: 2 + Math.random() * 2.5,
      delay: Math.random() * 0.18,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });
}

interface Celebration {
  key: number;
  newLevel: number;
  particles: Particle[];
}

export default function UpHeroLevelUpOverlay() {
  const level = useGameStore((s) => s.progress.level);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore(
    (s) => s.hasCompletedOnboarding,
  );
  const { t, language } = useTranslation();
  const { play } = useSound();
  const reducedMotion = useReducedMotion();
  const { announce } = useAnnounce();

  const prevLevelRef = useRef<number | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    if (!isLoaded || !hasCompletedOnboarding) return;
    // 첫 seed — 실제 level 값을 조용히 기록 (store 기본값 0 → 실제값 전환이
    // false-positive 축하를 트리거하지 않도록).
    if (prevLevelRef.current === null) {
      prevLevelRef.current = level;
      return;
    }
    if (level > prevLevelRef.current) {
      prevLevelRef.current = level;
      setCelebration({
        key: Date.now(),
        newLevel: level,
        particles: reducedMotion ? [] : generateParticles(),
      });
      play("levelUp");
      announce(t("uphero.levelup.announce", { level }), "assertive");
      return;
    }
    // 레벨 동일/하향 (서버 보정 등): ref 만 조용히 맞춤
    prevLevelRef.current = level;
  }, [
    level,
    isLoaded,
    hasCompletedOnboarding,
    reducedMotion,
    play,
    announce,
    t,
  ]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(
      () => setCelebration(null),
      AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [celebration]);

  if (typeof window === "undefined") return null;

  const dismiss = () => setCelebration(null);

  return createPortal(
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={celebration.key}
          role="status"
          aria-live="off"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={dismiss}
          className="fixed inset-0 z-[65] flex items-center justify-center px-6 cursor-pointer"
          style={{ background: "rgba(10, 10, 12, 0.72)" }}
        >
          <div className="flex flex-col items-center gap-4 relative pointer-events-none">
            {/* 타이틀 — LEVEL UP! */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={
                reducedMotion
                  ? { opacity: 1, y: 0 }
                  : {
                      opacity: 1,
                      y: 0,
                      rotate: [0, -2, 2, -1.5, 1.5, 0],
                    }
              }
              transition={{
                opacity: { duration: 0.3, ease: "easeOut" },
                y: { duration: 0.4, ease: "easeOut" },
                rotate: { duration: 0.6, ease: "easeInOut", delay: 0.1 },
              }}
              className="typo-heading text-accent tracking-widest"
              style={{ letterSpacing: "0.2em" }}
            >
              {t("uphero.levelup.title")}
            </motion.div>

            {/* 레벨 숫자 + 파티클 */}
            <motion.div
              initial={{ scale: reducedMotion ? 1 : 0.6, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                ...(reducedMotion
                  ? {}
                  : { rotate: [0, -3, 3, -2, 2, 0] }),
              }}
              transition={
                reducedMotion
                  ? { duration: 0.3 }
                  : {
                      scale: {
                        type: "spring",
                        stiffness: 260,
                        damping: 18,
                        delay: 0.15,
                      },
                      opacity: { duration: 0.25, delay: 0.15 },
                      rotate: {
                        duration: 0.55,
                        ease: "easeInOut",
                        delay: 0.35,
                      },
                    }
              }
              className="relative flex flex-col items-center gap-1.5"
            >
              <div className="flex items-center gap-2">
                <PixelIcon
                  name="Zap"
                  size={40}
                  color="var(--accent-primary)"
                />
                <span
                  className="font-display text-accent"
                  style={{ fontSize: 56, lineHeight: 1, letterSpacing: "0.04em" }}
                >
                  {t("common.levelShort", { level: celebration.newLevel })}
                </span>
              </div>
              <span className="typo-body text-text-secondary">
                {getTitleForLevel(celebration.newLevel, language)}
              </span>

              {/* 파티클 — 레벨 숫자 중심에서 방사형으로 */}
              {!reducedMotion && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {celebration.particles.map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                      animate={{
                        x: p.x,
                        y: p.y,
                        scale: 0,
                        opacity: 0,
                      }}
                      transition={{
                        duration: 0.8 + Math.random() * 0.3,
                        delay: p.delay + 0.2,
                        ease: "easeOut",
                      }}
                      className="absolute rounded-full"
                      style={{
                        width: p.size,
                        height: p.size,
                        backgroundColor: p.color,
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>

            {/* 서브 — "Lv.X 달성" */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5, ease: "easeOut" }}
              className="typo-caption text-text-tertiary"
            >
              {t("uphero.levelup.reached", { level: celebration.newLevel })}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
