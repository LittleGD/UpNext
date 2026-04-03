"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

interface ExtraChallengeBannerProps {
  onPress: () => void;
}

const HOLD_DURATION = 1200; // ms to hold

export default function ExtraChallengeBanner({ onPress }: ExtraChallengeBannerProps) {
  const { play } = useSound();
  const { t } = useTranslation();
  const [holding, setHolding] = useState(false);
  const [activated, setActivated] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdStartRef = useRef(0);
  const rafRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const completedRef = useRef(false);

  const startHold = useCallback(() => {
    if (activated) return;
    completedRef.current = false;
    holdStartRef.current = Date.now();
    setHolding(true);
    play("chargeUp");

    function tick() {
      const elapsed = Date.now() - holdStartRef.current;
      const p = Math.min(elapsed / HOLD_DURATION, 1);
      setProgress(p);

      if (p >= 1 && !completedRef.current) {
        completedRef.current = true;
        setActivated(true);
        setHolding(false);
        play("fireIgnite");
        // Small delay for the activation animation to play
        timeoutRef.current = setTimeout(() => onPress(), 400);
        return;
      }

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [activated, onPress, play]);

  const cancelHold = useCallback(() => {
    if (completedRef.current) return;
    setHolding(false);
    setProgress(0);
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(timeoutRef.current); };
  }, []);

  return (
    <>
      <style>{`
        @keyframes extra-ember-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 0.8; }
          100% { transform: translateY(-32px) scale(0); opacity: 0; }
        }
      `}</style>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: "spring", bounce: 0.2 }}
      >
        <motion.button
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          animate={activated ? {
            scale: [1, 1.03, 0.97, 1],
          } : {}}
          transition={activated ? { duration: 0.4 } : {}}
          className="w-full relative overflow-hidden rounded-2xl cursor-pointer select-none touch-none"
          style={{
            background: "var(--bg-elevated)",
          }}
        >
          {/* Progress fill — slides up from bottom */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(to top, rgba(255,70,50,0.25), rgba(255,100,0,0.15), rgba(255,140,0,0.05))",
              transformOrigin: "bottom",
              scaleY: progress,
            }}
          />

          {/* Activated glow overlay */}
          <AnimatePresence>
            {activated && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to top, rgba(255,70,50,0.3), rgba(255,100,0,0.15), transparent)",
                  boxShadow: "inset 0 0 40px rgba(255,70,50,0.15)",
                }}
              />
            )}
          </AnimatePresence>

          {/* Rising ember particles while holding */}
          {holding && [0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 2,
                height: 2,
                background: i % 2 === 0 ? "#FF4632" : "#FF8C00",
                bottom: 16,
                left: `${15 + i * 17}%`,
                animation: `extra-ember-rise ${0.6 + i * 0.15}s ease-out infinite`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}

          {/* Content */}
          <div className="relative z-10 flex items-center gap-4 py-5 px-5">
            {/* Fire icon with charge glow */}
            <div className="relative flex-shrink-0">
              <motion.div
                animate={holding ? {
                  scale: [1, 1.2, 1],
                  rotate: [0, -5, 5, 0],
                } : activated ? {
                  scale: [1, 1.3, 1],
                } : {}}
                transition={holding ? {
                  duration: 0.5,
                  repeat: Infinity,
                } : { duration: 0.3 }}
              >
                <PixelIcon
                  name="Fire"
                  size={24}
                  color={holding || activated ? "#FF4632" : "var(--text-tertiary)"}
                />
              </motion.div>
              {/* Glow ring during hold */}
              {(holding || activated) && (
                <motion.div
                  className="absolute -inset-2 rounded-full pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  style={{
                    background: "radial-gradient(circle, rgba(255,70,50,0.3) 0%, transparent 70%)",
                  }}
                />
              )}
            </div>

            {/* Text */}
            <div className="flex-1 text-left">
              <p
                className="typo-body leading-snug transition-colors duration-300"
                style={{
                  color: holding || activated
                    ? "#FF6B4A"
                    : "var(--text-secondary)",
                }}
              >
                {t("extra.banner.title")}
              </p>
              {!activated && (
                <p className="typo-caption mt-0.5 text-text-tertiary">
                  {t("extra.banner.hint")}
                </p>
              )}
            </div>

            {/* Progress ring / chevron */}
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
              {holding && !activated ? (
                <svg width="28" height="28" viewBox="0 0 28 28" className="rotate-[-90deg]">
                  <circle
                    cx="14" cy="14" r="11"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="2.5"
                  />
                  <motion.circle
                    cx="14" cy="14" r="11"
                    fill="none"
                    stroke="#FF4632"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 11}
                    strokeDashoffset={2 * Math.PI * 11 * (1 - progress)}
                  />
                </svg>
              ) : activated ? (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <PixelIcon name="ChevronRight" size={18} color="#FF4632" />
                </motion.div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
                </div>
              )}
            </div>
          </div>
        </motion.button>
      </motion.div>
    </>
  );
}
