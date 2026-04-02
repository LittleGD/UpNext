"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { getTitleForLevel } from "@/types/game";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

interface LevelUpScreenProps {
  onComplete: () => void;
}

// 파티클 설정
const PARTICLE_COUNT = 16;
function generateParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (360 / PARTICLE_COUNT) * i + (Math.random() - 0.5) * 20;
    const rad = (angle * Math.PI) / 180;
    const distance = 60 + Math.random() * 80;
    return {
      id: i,
      x: Math.cos(rad) * distance,
      y: Math.sin(rad) * distance,
      size: 1 + Math.random() * 1.5,
      delay: Math.random() * 0.15,
      color: ["var(--accent-primary)", "var(--accent-cyan)", "var(--accent-secondary)", "var(--rarity-legend)"][
        Math.floor(Math.random() * 4)
      ],
    };
  });
}

export default function LevelUpScreen({ onComplete }: LevelUpScreenProps) {
  const [phase, setPhase] = useState<"filling" | "burst" | "done">("filling");
  const [particles] = useState(generateParticles);
  const { play } = useSound();
  const { t, language } = useTranslation();

  useEffect(() => {
    // 프로그레스 바가 차는 애니메이션 후 → burst → done
    const t1 = setTimeout(() => { setPhase("burst"); play("levelUp"); }, 1800);
    const t2 = setTimeout(() => setPhase("done"), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const isBurst = phase === "burst" || phase === "done";

  return (
    <div className="flex flex-col min-h-[100dvh] px-6 relative z-[1] max-w-md mx-auto w-full">
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
      {/* 레벨 아이콘 + 숫자 */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          rotate: isBurst ? [0, -5, 5, -4, 4, -2, 2, 0] : 0,
        }}
        transition={
          isBurst
            ? { rotate: { duration: 0.6, ease: "easeInOut" }, type: "spring", stiffness: 300, damping: 20 }
            : { type: "spring", stiffness: 300, damping: 20 }
        }
        className="flex flex-col items-center gap-2 relative"
      >
        {/* 아이콘 떨림 */}
        <motion.div
          animate={
            isBurst
              ? {
                  x: [0, -3, 3, -2, 2, -1, 1, 0],
                  y: [0, -2, 1, -1, 2, -1, 0, 0],
                }
              : {}
          }
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <PixelIcon name="Zap" size={48} color="var(--accent-primary)" />
        </motion.div>
        <p className="text-display text-accent">Lv.1</p>
        <p className="text-body text-text-secondary">{getTitleForLevel(1, language)}</p>
      </motion.div>

      {/* 프로그레스 바 + 파티클 */}
      <div className="w-full max-w-xs relative">
        <div className="h-2 bg-bg-elevated rounded-sm overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-sm"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.5, ease: "easeInOut", delay: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-caption">Lv.0</span>
          <span className="text-caption text-accent">Lv.1</span>
        </div>

        {/* 파티클 — 프로그레스 바 오른쪽 끝에서 발사 */}
        <AnimatePresence>
          {isBurst && (
            <div className="absolute top-1 right-0 pointer-events-none">
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    scale: 0,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 0.7 + Math.random() * 0.3,
                    delay: p.delay,
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
        </AnimatePresence>
      </div>

      {/* 메시지 */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: phase === "done" ? 1 : 0, y: phase === "done" ? 0 : 10 }}
        transition={{ duration: 0.4 }}
        className="text-body text-text-primary text-center"
      >
        {t("onboarding.levelup.message")}
      </motion.p>

      </div>

      {/* 계속 버튼 */}
      <div className="pb-[calc(env(safe-area-inset-bottom)+24px)] w-full">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase === "done" ? 1 : 0, y: phase === "done" ? 0 : 20 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          whileTap={{ scale: 0.95 }}
          onClick={onComplete}
          className="w-full py-4 bg-accent text-bg-primary rounded-md font-semibold text-lg"
        >
          {t("onboarding.levelup.button")}
        </motion.button>
      </div>
    </div>
  );
}
