"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface ChallengeConfirmModalProps {
  phase: "extra" | "super";
  onConfirm: () => void;
  onCancel: () => void;
}

const PHASE_CONFIG = {
  extra: {
    accent: "#FF4632",
    accentSoft: "rgba(255,70,50,0.08)",
    gradient: "linear-gradient(160deg, rgba(255,70,50,0.06) 0%, transparent 50%)",
    buttonGradient: "linear-gradient(135deg, #FF4632, #FF6B4A)",
    glowColor: "rgba(255,70,50,0.12)",
    particleColors: ["#FF4632", "#FF8C00", "#FF6B4A"],
  },
  super: {
    accent: "#C832A0",
    accentSoft: "rgba(200,50,160,0.08)",
    gradient: "linear-gradient(160deg, rgba(255,50,50,0.05) 0%, rgba(200,50,150,0.04) 30%, transparent 60%)",
    buttonGradient: "linear-gradient(135deg, #FF4632, #C832A0, #8C32C8)",
    glowColor: "rgba(200,50,160,0.10)",
    particleColors: ["#FF4632", "#FF6B9D", "#C832A0", "#8C32C8"],
  },
};

export default function ChallengeConfirmModal({
  phase,
  onConfirm,
  onCancel,
}: ChallengeConfirmModalProps) {
  const { play } = useSound();
  const { t } = useTranslation();
  const config = PHASE_CONFIG[phase];
  // Phase 13 design review — destructive confirm → alertdialog + focus trap + ESC.
  //   이전엔 useScrollLock 만 있어 키보드 유저가 ESC 로 닫을 수 없고 focus 밖으로 빠짐.
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onCancel);
  const reducedMotion = useReducedMotion();

  return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
        onClick={onCancel}
      >
        <motion.div
          ref={containerRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="challenge-confirm-title"
          aria-describedby="challenge-confirm-desc"
          initial={reducedMotion ? false : { y: 60, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: 60, opacity: 0, scale: 0.95 }}
          transition={
            reducedMotion
              ? { duration: 0.12 }
              : { type: "spring", duration: 0.5, bounce: 0.18 }
          }
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl overflow-hidden relative"
          style={{
            backgroundColor: "var(--bg-elevated)",
            boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 60px ${config.glowColor}`,
            outline: "none",
          }}
        >
          {/* Subtle top gradient wash */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: config.gradient }}
          />

          {/* Floating particles — decorative only. Phase 13 design review:
                RM 유저는 스킵 (무한 framer loop 은 rAF 계속 돌림). 정적 렌더링
                유지해 시각 분위기는 보존. */}
          {!reducedMotion &&
            config.particleColors.map((color, i) => (
              <motion.div
                key={i}
                aria-hidden="true"
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 2,
                  height: 2,
                  background: color,
                  top: `${20 + i * 15}%`,
                  left: `${15 + i * 20}%`,
                }}
                animate={{
                  y: [0, -12, 0],
                  opacity: [0.2, 0.5, 0.2],
                }}
                transition={{
                  duration: 2 + i * 0.5,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut",
                }}
              />
            ))}

          <div className="relative z-10 px-7 pt-8 pb-7 flex flex-col items-center text-center">
            {/* Icon — clean, no box.
                Phase 9c: Emil 원칙 — 실생활에서 아무것도 없다 나타나는 건 없다.
                scale 0 → 0.4 로 시작해 "작은 실루엣이 커지는" 느낌. */}
            <motion.div
              initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
              className="relative mb-6"
            >
              <PixelIcon name="Fire" size={36} color={config.accent} />
              {/* Ambient glow behind icon */}
              <motion.div
                className="absolute -inset-4 rounded-full pointer-events-none"
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{
                  background: `radial-gradient(circle, ${config.accent}20 0%, transparent 70%)`,
                }}
              />
            </motion.div>

            {/* Title */}
            <motion.h3
              id="challenge-confirm-title"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : 0.15 }}
              className="typo-heading text-text-primary leading-snug"
            >
              {t(`${phase}.confirm.title`)}
            </motion.h3>

            {/* Warning — softer styling */}
            <motion.p
              id="challenge-confirm-desc"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : 0.2 }}
              className="typo-caption text-text-tertiary mt-2.5 leading-relaxed"
            >
              {t(`${phase}.confirm.warning`)}
            </motion.p>

            {/* Rule badge — pill style */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-4 px-3.5 py-1.5 rounded-full"
              style={{ backgroundColor: config.accentSoft }}
            >
              <p
                className="typo-micro"
                style={{ color: config.accent }}
              >
                {t(`${phase}.confirm.rule`)}
              </p>
            </motion.div>

            {/* Buttons — stacked for mobile elegance */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col w-full gap-2.5 mt-7"
            >
              {/* Primary CTA */}
              <button
                onClick={() => {
                  play("select");
                  onConfirm();
                }}
                className="w-full py-3.5 rounded-xl text-white typo-body transition-[transform,filter] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] active:brightness-90"
                style={{
                  background: config.buttonGradient,
                }}
              >
                {t(`${phase}.confirm.go`)}
              </button>

              {/* Secondary — text button style with press feedback */}
              <button
                onClick={() => {
                  play("select");
                  onCancel();
                }}
                className="w-full py-3 rounded-xl text-text-tertiary typo-body transition-[color,transform] duration-160 ease-out active:text-text-secondary active:scale-[0.97]"
              >
                {t(`${phase}.confirm.rest`)}
              </button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
  );
}
