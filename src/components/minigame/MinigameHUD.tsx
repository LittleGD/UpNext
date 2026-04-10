"use client";

import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { REWARD_POOL } from "@/data/minigame";

/**
 * 라운드 HUD — 상단 고정.
 * 좌: 라운드 표시
 * 중: 기회(하트) + 활성 버프 칩
 * 우: 나가기 X
 */
export default function MinigameHUD() {
  const { t } = useTranslation();
  const currentRound = useMinigameStore((s) => s.currentRound);
  const chancesLeft = useMinigameStore((s) => s.chancesLeft);
  const activeBuffs = useMinigameStore((s) => s.activeBuffs);
  const mulliganActive = useMinigameStore((s) => s.mulliganActive);
  const requestExit = useMinigameStore((s) => s.requestExit);

  const visibleBuffs = activeBuffs.filter((b) => !b.consumed);
  // run 스코프(=전 라운드 지속) 버프만 pulse glow — 즉각적인 "지금 작동 중" 피드백.
  const isRunScoped = (id: string) =>
    id === "compass" || id === "doubleLoot" || id === "duplicateStash";

  return (
    <div
      className="sticky top-0 z-40 bg-bg-primary/90 backdrop-blur-sm border-b border-white/5"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        {/* 라운드 */}
        <div className="flex-shrink-0">
          <p className="typo-caption text-text-tertiary">
            {t("minigame.hud.round", { current: currentRound, total: 3 })}
          </p>
        </div>

        {/* 기회 (하트) + 멀리건 칩 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.max(4, chancesLeft) }).map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  opacity: i < chancesLeft ? 1 : 0.25,
                  scale: i < chancesLeft ? 1 : 0.85,
                }}
                transition={{ duration: 0.2 }}
              >
                <PixelIcon
                  name="Heart"
                  size={20}
                  color={i < chancesLeft ? "#F037A5" : "#3a3a3a"}
                />
              </motion.div>
            ))}
          </div>
          <AnimatePresence>
            {mulliganActive && (
              <motion.div
                key="mulligan-chip"
                initial={{ opacity: 0, scale: 0.7, x: -4 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: 0,
                  boxShadow: [
                    "0 0 0 rgba(155,240,225,0)",
                    "0 0 12px rgba(155,240,225,0.45)",
                    "0 0 0 rgba(155,240,225,0)",
                  ],
                }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.2 },
                  boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                }}
                className="px-2 py-0.5 rounded bg-bg-surface typo-micro text-accent whitespace-nowrap"
                style={{ border: "1px solid rgba(155,240,225,0.5)" }}
              >
                {t("minigame.hud.mulliganActive")}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 나가기 — 확인 프롬프트를 띄운다(MinigameExitOverlay 공유) */}
        <button
          onClick={requestExit}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-bg-surface transition-colors"
          aria-label="Exit run"
        >
          <PixelIcon name="Cancel" size={16} color="#808080" />
          <span className="typo-caption text-text-tertiary">
            {t("minigame.hud.exit")}
          </span>
        </button>
      </div>

      {/* 활성 버프 칩 */}
      {visibleBuffs.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          <AnimatePresence>
            {visibleBuffs.map((b, i) => {
              const def = REWARD_POOL.find((r) => r.id === b.effectId);
              if (!def) return null;
              const runScoped = isRunScoped(b.effectId);
              return (
                <motion.div
                  key={`${b.effectId}-${i}`}
                  initial={{ opacity: 0, y: -4, scale: 1.25 }}
                  animate={
                    runScoped
                      ? {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          boxShadow: [
                            "0 0 0 rgba(240,55,165,0)",
                            "0 0 10px rgba(240,55,165,0.35)",
                            "0 0 0 rgba(240,55,165,0)",
                          ],
                        }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  exit={{ opacity: 0, y: -4 }}
                  transition={
                    runScoped
                      ? {
                          opacity: { duration: 0.25 },
                          y: { duration: 0.25 },
                          scale: { type: "spring", stiffness: 380, damping: 22 },
                          boxShadow: { duration: 3, repeat: Infinity, ease: "easeInOut" },
                        }
                      : {
                          scale: { type: "spring", stiffness: 380, damping: 22 },
                        }
                  }
                  className="px-2 py-0.5 rounded bg-bg-surface border border-accent-secondary/30 typo-micro text-accent-secondary"
                >
                  {t(def.nameKey as "minigame.title")}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
