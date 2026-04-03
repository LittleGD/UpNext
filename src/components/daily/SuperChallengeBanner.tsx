"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

interface SuperChallengeBannerProps {
  onPress: () => void;
}

const HOLD_DURATION = 1800; // longer hold for super

export default function SuperChallengeBanner({ onPress }: SuperChallengeBannerProps) {
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
        play("superIgnite");
        timeoutRef.current = setTimeout(() => onPress(), 500);
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

  // Intensity ramps with progress
  const intensity = activated ? 1 : progress;

  return (
    <>
      <style>{`
        @keyframes super-ember-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 0.9; }
          100% { transform: translateY(-40px) scale(0); opacity: 0; }
        }
        @keyframes super-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
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
            scale: [1, 1.04, 0.96, 1.02, 1],
          } : {}}
          transition={activated ? { duration: 0.5 } : {}}
          className="w-full relative overflow-hidden rounded-2xl cursor-pointer select-none touch-none"
          style={{
            background: "var(--bg-elevated)",
          }}
        >
          {/* Multi-layer progress fill */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(to top,
                rgba(255,50,50,${0.3 * intensity}),
                rgba(200,50,150,${0.2 * intensity}),
                rgba(140,50,200,${0.1 * intensity}),
                transparent
              )`,
              transformOrigin: "bottom",
              scaleY: progress,
            }}
          />

          {/* Shimmer sweep during hold */}
          {holding && progress > 0.3 && (
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{ opacity: (progress - 0.3) * 1.4 }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
                  animation: "super-shimmer 1.2s ease-in-out infinite",
                }}
              />
            </div>
          )}

          {/* Activated glow */}
          <AnimatePresence>
            {activated && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to top, rgba(255,50,50,0.35), rgba(200,50,150,0.2), rgba(140,50,200,0.1), transparent)",
                  boxShadow: "inset 0 0 50px rgba(255,50,50,0.15), inset 0 0 80px rgba(200,50,150,0.08)",
                }}
              />
            )}
          </AnimatePresence>

          {/* Rising ember particles */}
          {(holding || activated) && [0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: i % 3 === 0 ? 3 : 2,
                height: i % 3 === 0 ? 3 : 2,
                background: ["#FF4632", "#FF6B9D", "#C832A0", "#8C32C8"][i % 4],
                bottom: 12,
                left: `${10 + i * 12}%`,
                animation: `super-ember-rise ${0.7 + i * 0.12}s ease-out infinite`,
                animationDelay: `${i * 0.1}s`,
                opacity: intensity,
              }}
            />
          ))}

          {/* Content */}
          <div className="relative z-10 flex items-center gap-4 py-5 px-5">
            {/* Fire icon with intensity */}
            <div className="relative flex-shrink-0">
              <motion.div
                animate={holding ? {
                  scale: [1, 1.25, 1],
                  rotate: [0, -8, 8, -4, 0],
                } : activated ? {
                  scale: [1, 1.4, 1.1, 1],
                } : {}}
                transition={holding ? {
                  duration: 0.4,
                  repeat: Infinity,
                } : { duration: 0.4 }}
              >
                <PixelIcon
                  name="Fire"
                  size={24}
                  color={
                    activated ? "#FF4632"
                      : holding ? `rgba(255,${Math.round(70 + progress * 50)},${Math.round(50 + progress * 30)},1)`
                        : "var(--text-tertiary)"
                  }
                />
              </motion.div>
              {/* Multi-ring glow */}
              {(holding || activated) && (
                <>
                  <motion.div
                    className="absolute -inset-2 rounded-full pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.2, 0.5, 0.2] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                    style={{
                      background: "radial-gradient(circle, rgba(255,50,50,0.35) 0%, transparent 70%)",
                    }}
                  />
                  <motion.div
                    className="absolute -inset-4 rounded-full pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
                    style={{
                      background: "radial-gradient(circle, rgba(200,50,150,0.2) 0%, transparent 70%)",
                    }}
                  />
                </>
              )}
            </div>

            {/* Text */}
            <div className="flex-1 text-left">
              <p
                className="typo-body leading-snug transition-colors duration-300"
                style={{
                  color: activated
                    ? "#FF6B9D"
                    : holding
                      ? `rgba(255,${Math.round(107 + progress * 40)},${Math.round(157 - progress * 80)},1)`
                      : "var(--text-secondary)",
                }}
              >
                {t("super.banner.title")}
              </p>
              {!activated && (
                <p className="typo-caption mt-0.5 text-text-tertiary">
                  {t("super.banner.hint")}
                </p>
              )}
            </div>

            {/* Progress ring / indicator */}
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
              {holding && !activated ? (
                <svg width="28" height="28" viewBox="0 0 28 28" className="rotate-[-90deg]">
                  <circle
                    cx="14" cy="14" r="11"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="2.5"
                  />
                  {/* Gradient ring via two arcs */}
                  <motion.circle
                    cx="14" cy="14" r="11"
                    fill="none"
                    stroke="url(#superGrad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 11}
                    strokeDashoffset={2 * Math.PI * 11 * (1 - progress)}
                  />
                  <defs>
                    <linearGradient id="superGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FF4632" />
                      <stop offset="50%" stopColor="#C832A0" />
                      <stop offset="100%" stopColor="#8C32C8" />
                    </linearGradient>
                  </defs>
                </svg>
              ) : activated ? (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <PixelIcon name="ChevronRight" size={18} color="#C832A0" />
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
