"use client";

import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

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

  return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-lg px-4 pb-6 sm:pb-0"
        onClick={onCancel}
      >
        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 60, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl overflow-hidden relative"
          style={{
            backgroundColor: "var(--bg-elevated)",
            boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 60px ${config.glowColor}`,
          }}
        >
          {/* Subtle top gradient wash */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: config.gradient }}
          />

          {/* Floating particles */}
          {config.particleColors.map((color, i) => (
            <motion.div
              key={i}
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
            {/* Icon — clean, no box */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
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
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="font-semibold text-[18px] text-text-primary leading-snug"
            >
              {t(`${phase}.confirm.title`)}
            </motion.h3>

            {/* Warning — softer styling */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-[14px] text-text-tertiary mt-2.5 leading-relaxed"
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
                className="text-[12px] font-medium"
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
                className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all active:scale-[0.97] active:brightness-90"
                style={{
                  background: config.buttonGradient,
                }}
              >
                {t(`${phase}.confirm.go`)}
              </button>

              {/* Secondary — text button style */}
              <button
                onClick={() => {
                  play("select");
                  onCancel();
                }}
                className="w-full py-3 rounded-xl text-text-tertiary font-medium text-[14px] transition-colors active:text-text-secondary"
              >
                {t(`${phase}.confirm.rest`)}
              </button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
  );
}
