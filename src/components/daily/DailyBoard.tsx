"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import { MODE_CARD_COUNT, getXPProgress, XP_PER_RARITY, getTitleForLevel } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springSnappy } from "@/lib/motion";
import PixelConfetti from "@/components/effects/PixelConfetti";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";

// === Mini-game: Tap falling stars ===
interface FallingStar {
  id: number;
  x: number;       // % from left
  speed: number;    // px per frame
  y: number;
  caught: boolean;
  color: string;
}

const STAR_COLORS = ["var(--accent-primary)", "var(--accent-cyan)", "var(--accent-fushia)", "#FFFFFF"];

function CatchStarGame({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<FallingStar[]>([]);
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const nextIdRef = useRef(0);
  const rafRef = useRef(0);
  const lastSpawnRef = useRef(0);

  const handleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Check if tap hit any star (32px hit radius)
    const stars = starsRef.current;
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      if (s.caught) continue;
      const sx = (s.x / 100) * canvas.width;
      const sy = s.y;
      const dist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
      if (dist < 32) {
        s.caught = true;
        scoreRef.current++;
        setScore(scoreRef.current);
        setShowScore(true);
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    scoreRef.current = 0;
    setScore(0);
    starsRef.current = [];

    function spawnStar() {
      starsRef.current.push({
        id: nextIdRef.current++,
        x: 10 + Math.random() * 80,
        speed: 0.8 + Math.random() * 1.2,
        y: -8,
        caught: false,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      });
    }

    function animate(time: number) {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn new stars
      if (time - lastSpawnRef.current > 600) {
        spawnStar();
        lastSpawnRef.current = time;
      }

      const stars = starsRef.current;
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        if (s.caught) {
          // Burst effect
          ctx.fillStyle = s.color;
          ctx.globalAlpha = 0.6;
          for (let j = 0; j < 4; j++) {
            const angle = (j / 4) * Math.PI * 2 + time * 0.01;
            const bx = (s.x / 100) * canvas.width + Math.cos(angle) * 8;
            const by = s.y + Math.sin(angle) * 8;
            ctx.fillRect(bx, by, 1, 1);
          }
          ctx.globalAlpha = 1;
          stars.splice(i, 1);
          continue;
        }

        s.y += s.speed;

        // Remove off-screen
        if (s.y > canvas.height + 10) {
          stars.splice(i, 1);
          continue;
        }

        // Draw 3x3 pixel cross (plus shape)
        const sx = Math.floor((s.x / 100) * canvas.width);
        const sy = Math.floor(s.y);
        ctx.fillStyle = s.color;
        ctx.fillRect(sx, sy, 1, 1);       // center
        ctx.fillRect(sx - 1, sy, 1, 1);   // left
        ctx.fillRect(sx + 1, sy, 1, 1);   // right
        ctx.fillRect(sx, sy - 1, 1, 1);   // top
        ctx.fillRect(sx, sy + 1, 1, 1);   // bottom
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-10">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onTouchStart={handleTap}
        onClick={handleTap}
      />
      <AnimatePresence>
        {showScore && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm rounded-md px-2 py-1"
          >
            <span className="text-[13px] text-accent font-bold">{score}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === Completion celebration ===
function CompletionCard() {
  const progress = useGameStore((s) => s.progress);
  const { t, language } = useTranslation();
  const { play } = useSound();
  const [trophyTaps, setTrophyTaps] = useState(0);
  const [miniGameActive, setMiniGameActive] = useState(false);
  const trophyRotate = useSpring(0, { stiffness: 300, damping: 15 });
  const trophyScale = useSpring(1, { stiffness: 400, damping: 12 });
  const xpInfo = getXPProgress(progress.xp || 0, progress.level);

  const handleTrophyTap = () => {
    play("xpGain");
    const next = trophyTaps + 1;
    setTrophyTaps(next);

    // Spin animation on tap
    trophyRotate.set(trophyRotate.get() + (Math.random() > 0.5 ? 15 : -15));
    trophyScale.set(1.15);
    setTimeout(() => {
      trophyRotate.set(0);
      trophyScale.set(1);
    }, 300);

    // Easter egg: 5 taps activates mini-game
    if (next >= 5 && !miniGameActive) {
      setMiniGameActive(true);
      play("packOpen");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springSnappy}
      className="rounded-lg bg-accent overflow-hidden relative"
    >
      <CatchStarGame active={miniGameActive} />

      <div className="flex flex-col items-center justify-center py-10 px-6 relative z-20">
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-[2px] h-[2px] bg-bg-primary/30 rounded-full"
            initial={{
              x: (Math.random() - 0.5) * 200,
              y: (Math.random() - 0.5) * 100,
              opacity: 0,
            }}
            animate={{
              y: [(Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Trophy — tap to interact */}
        <motion.button
          onClick={handleTrophyTap}
          style={{ rotate: trophyRotate, scale: trophyScale }}
          whileTap={{ scale: 0.9 }}
          className="cursor-pointer relative"
        >
          <PixelIcon name="Trophy" size={64} color="#0A0A0A" />
          {/* Glow ring on tap */}
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={trophyTaps > 0 ? {
              boxShadow: ["0 0 0px rgba(10,10,10,0)", "0 0 20px rgba(10,10,10,0.3)", "0 0 0px rgba(10,10,10,0)"],
            } : {}}
            transition={{ duration: 0.6 }}
          />
        </motion.button>

        {/* Tap hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: trophyTaps === 0 ? 0.5 : 0 }}
          transition={{ delay: 2, duration: 0.5 }}
          className="text-[11px] text-bg-primary/40 mt-1"
        >
          tap me
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-heading-1 text-bg-primary mt-3 text-center"
        >
          {t("daily.board.allDoneTitle")}
        </motion.p>

        {/* Streak with counting animation */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex items-center gap-2 mt-2"
        >
          <PixelIcon name="Zap" size={18} color="#0A0A0A" />
          <span className="text-body text-bg-primary font-semibold">
            {t("daily.board.streak", { days: progress.currentStreak })}
          </span>
        </motion.div>

        {/* XP bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-3 w-full max-w-[200px]"
        >
          <div className="flex justify-between text-[11px] text-bg-primary/60 mb-1">
            <span>Lv.{progress.level} {getTitleForLevel(progress.level, language)}</span>
            <span>{xpInfo.current}/{xpInfo.needed}</span>
          </div>
          <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-bg-primary/70 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${(xpInfo.current / xpInfo.needed) * 100}%` }}
              transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        {/* Mini-game hint after 3 taps */}
        <AnimatePresence>
          {trophyTaps >= 3 && trophyTaps < 5 && !miniGameActive && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-bg-primary/50 mt-2"
            >
              {5 - trophyTaps} more...
            </motion.p>
          )}
        </AnimatePresence>

        {miniGameActive && (
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 0.7, y: 0 }}
            className="text-[11px] text-bg-primary/60 mt-2"
          >
            catch the stars!
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

export default function DailyBoard() {
  const daily = useGameStore((s) => s.daily);
  const progress = useGameStore((s) => s.progress);
  const completeChallenge = useGameStore((s) => s.completeChallenge);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [confirmCard, setConfirmCard] = useState<ChallengeCard | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [completingCard, setCompletingCard] = useState<ChallengeCard | null>(null);
  const [completingXp, setCompletingXp] = useState(0);

  const completedCount = daily.completedIds.length;
  const totalCount = daily.selectedCards.length;
  const allDone = totalCount > 0 && completedCount >= totalCount;

  const handleConfirm = () => {
    if (confirmCard) {
      const xp = XP_PER_RARITY[confirmCard.rarity] || 10;
      // Show success state in modal
      setCompletingCard(confirmCard);
      setCompletingXp(xp);
      setConfirmCard(null);
      play("complete");
      setTimeout(() => play("xpGain"), 280);
      completeChallenge(confirmCard.id);

      const willBeAllDone = completedCount + 1 >= totalCount;

      // Dismiss success state after delay
      setTimeout(() => {
        setCompletingCard(null);
        if (willBeAllDone) {
          setTimeout(() => play("fullClear"), 100);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2000);
        }
      }, 1200);
    }
  };

  return (
    <div className="space-y-4">
      <PixelConfetti trigger={showConfetti} />

      {/* Completion card */}
      {allDone && <CompletionCard />}

      {/* Header — compact progress */}
      <div className="flex items-center justify-between">
        <h2 className="text-heading-2 text-text-primary">{t("daily.board.heading")}</h2>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalCount }, (_, i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              initial={false}
              animate={{
                backgroundColor: i < completedCount ? "var(--accent-primary)" : "var(--bg-elevated)",
                scale: i < completedCount ? [1, 1.3, 1] : 1,
              }}
              transition={{ duration: 0.3 }}
            />
          ))}
          <span className="text-caption ml-1">
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Challenge cards — large, spacious, refined */}
      <div className="space-y-5">
        {daily.selectedCards.map((card, index) => {
          const isCompleted = daily.completedIds.includes(card.id);
          const rarity = RARITY_CONFIG[card.rarity];
          const xp = XP_PER_RARITY[card.rarity] || 10;

          return (
            <motion.button
              key={card.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileTap={isCompleted ? {} : { scale: 0.97 }}
              onClick={() => {
                if (!isCompleted) {
                  play("select");
                  setConfirmCard(card);
                }
              }}
              className={`
                relative w-full text-left rounded-2xl overflow-hidden transition-colors
                ${isCompleted
                  ? "bg-bg-surface/40"
                  : "bg-bg-elevated hover:bg-bg-hover cursor-pointer"
                }
              `}
              style={!isCompleted ? { boxShadow: rarityGlow(card.rarity) } : undefined}
            >
              {/* Top accent line */}
              <div
                className="h-[2px] w-full"
                style={{
                  background: isCompleted
                    ? "var(--bg-elevated)"
                    : `linear-gradient(90deg, ${rarity.color}00 5%, ${rarity.color} 50%, ${rarity.color}00 95%)`,
                }}
              />

              {/* Rarity texture overlay */}
              {!isCompleted && <RarityTexture rarity={card.rarity} borderRadius={16} />}

              <div className="px-6 pt-6 pb-0 flex flex-col gap-5">
                {/* Top row: icon + meta */}
                <div className="flex items-start justify-between">
                  <div className={`
                    w-[72px] h-[72px] rounded-2xl flex items-center justify-center
                    ${isCompleted ? "bg-accent/10" : "bg-white/[0.04]"}
                  `}>
                    {isCompleted ? (
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      >
                        <PixelIcon name="Check" size={36} color="var(--accent-primary)" />
                      </motion.div>
                    ) : (
                      <div style={{ color: rarity.color }}>
                        <PixelIcon name={card.icon} size={36} />
                      </div>
                    )}
                  </div>

                  {/* Rarity badge + XP */}
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: isCompleted ? "var(--bg-elevated)" : `${rarity.color}18`,
                        color: isCompleted ? "var(--text-tertiary)" : rarity.color,
                      }}
                    >
                      {rarityLabel(card.rarity, language)}
                    </span>
                    {!isCompleted && (
                      <div className="flex items-center gap-1">
                        <PixelIcon name="Zap" size={14} color="var(--accent-primary)" />
                        <span className="text-[13px] text-accent font-semibold">+{xp}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title + description */}
                <div className="space-y-1.5">
                  <h3
                    className={`font-semibold text-[19px] leading-snug ${
                      isCompleted ? "line-through text-text-tertiary" : "text-text-primary"
                    }`}
                  >
                    {cardTitle(card, language)}
                  </h3>
                  <p className={`text-[15px] leading-relaxed ${isCompleted ? "text-text-tertiary" : "text-text-secondary"}`}>
                    {cardDesc(card, language)}
                  </p>
                </div>
              </div>

              {/* CTA bar */}
              <div className={`
                mx-6 mb-5 mt-4 py-3 rounded-xl text-center text-[15px] font-semibold transition-colors
                ${isCompleted
                  ? "bg-bg-elevated text-text-tertiary"
                  : "bg-bg-elevated text-accent"
                }
              `}>
                {isCompleted ? (
                  <span className="flex items-center justify-center gap-2">
                    <PixelIcon name="Check" size={16} color="var(--accent-primary)" />
                    {t("daily.board.completed")}
                  </span>
                ) : (
                  <span>{t("daily.board.markDone")}</span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {confirmCard && (() => {
          const rarity = RARITY_CONFIG[confirmCard.rarity];
          const xp = XP_PER_RARITY[confirmCard.rarity] || 10;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md px-4 pb-6 sm:pb-0"
              onClick={() => setConfirmCard(null)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                {/* Rarity accent line */}
                <div
                  className="h-[2px] w-full"
                  style={{
                    background: `linear-gradient(90deg, transparent 5%, ${rarity.color} 50%, transparent 95%)`,
                  }}
                />

                {/* Content */}
                <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center">
                  {/* Icon */}
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                    style={{ backgroundColor: `${rarity.color}12` }}
                  >
                    <div style={{ color: rarity.color }}>
                      <PixelIcon name={confirmCard.icon} size={32} />
                    </div>
                  </div>

                  {/* Title + desc */}
                  <h3 className="font-semibold text-[18px] text-text-primary leading-snug">
                    {cardTitle(confirmCard, language)}
                  </h3>
                  <p className="text-[14px] text-text-secondary mt-1.5 leading-relaxed">
                    {cardDesc(confirmCard, language)}
                  </p>

                  {/* XP reward badge */}
                  <div className="flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full bg-accent/8">
                    <PixelIcon name="Zap" size={14} color="var(--accent-primary)" />
                    <span className="text-[13px] text-accent font-semibold">+{xp} XP</span>
                  </div>

                  {/* Prompt */}
                  <p className="text-[14px] text-text-tertiary mt-5">
                    {t("daily.board.confirmPrompt")}
                  </p>

                  {/* Buttons */}
                  <div className="flex w-full gap-3 mt-5">
                    <button
                      onClick={() => { play("select"); setConfirmCard(null); }}
                      className="flex-1 py-3.5 rounded-xl bg-bg-elevated text-text-secondary font-semibold text-[15px] transition-colors active:scale-[0.97]"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex-1 py-3.5 rounded-xl bg-accent text-bg-primary font-semibold text-[15px] transition-colors active:scale-[0.97]"
                    >
                      {t("common.done")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Completion celebration overlay */}
      <AnimatePresence>
        {completingCard && (() => {
          const rarity = RARITY_CONFIG[completingCard.rarity];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
            >
              {/* Burst ring */}
              <motion.div
                initial={{ scale: 0.3, opacity: 0.8 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 120,
                  height: 120,
                  background: `radial-gradient(circle, ${rarity.color}40 0%, transparent 70%)`,
                }}
              />
              {/* Secondary burst */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0.6 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 80,
                  height: 80,
                  border: `2px solid ${rarity.color}60`,
                }}
              />

              {/* Radiating particles */}
              {[...Array(8)].map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const dist = 80 + (i % 3) * 30;
                return (
                  <motion.div
                    key={`burst-${i}`}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: 3,
                      height: 3,
                      background: i % 2 === 0 ? rarity.color : "white",
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist,
                      opacity: 0,
                      scale: 0,
                    }}
                    transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 * i }}
                  />
                );
              })}

              {/* Center content */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                className="flex flex-col items-center text-center relative"
              >
                {/* Check icon with glow */}
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.15 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                  style={{
                    background: `radial-gradient(circle, ${rarity.color}25 0%, transparent 70%)`,
                    boxShadow: `0 0 40px ${rarity.color}20`,
                  }}
                >
                  <PixelIcon name="Check" size={44} color={rarity.color} />
                </motion.div>

                {/* XP gain with counting animation */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full"
                  style={{ backgroundColor: `${rarity.color}15` }}
                >
                  <PixelIcon name="Zap" size={18} color="var(--accent-primary)" />
                  <motion.span
                    className="text-[20px] font-bold text-accent"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: [0.5, 1.2, 1] }}
                    transition={{ delay: 0.35, duration: 0.4 }}
                  >
                    +{completingXp} XP
                  </motion.span>
                </motion.div>

                {/* Floating +XP particles going up */}
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={`xp-float-${i}`}
                    className="absolute text-[12px] font-bold text-accent/60 pointer-events-none"
                    initial={{ opacity: 0, y: 0, x: (i - 1.5) * 25 }}
                    animate={{ opacity: [0, 0.7, 0], y: -60 - i * 15 }}
                    transition={{ delay: 0.4 + i * 0.12, duration: 0.8, ease: "easeOut" }}
                    style={{ top: 10 }}
                  >
                    +{Math.round(completingXp / 4)}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
