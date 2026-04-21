"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { REWARD_POOL } from "@/data/minigame";

/**
 * 라운드 HUD — 상단 고정.
 * 좌: 라운드 표시
 * 중: 기회(하트) + 활성 버프 칩
 * 우: 나가기 X
 *
 * Phase 14 design review:
 * - 하트는 색만이 아니라 모양(strike-through)으로도 empty 표시 → 색약 대응.
 * - 나가기 버튼 44×44 hit-area 확보.
 * - inline hex 제거, --color-* 토큰 사용.
 * - 버프 칩에 보상 아이콘 병행 표시 (색상 단독 의미 제거).
 * - scale 1.25→1 과장된 chip 진입을 0.96→1 로 완화.
 * - 무한 glow keyframe 은 useReducedMotion 가드.
 */
export default function MinigameHUD() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const currentRound = useMinigameStore((s) => s.currentRound);
  const chancesLeft = useMinigameStore((s) => s.chancesLeft);
  const activeBuffs = useMinigameStore((s) => s.activeBuffs);
  const mulliganActive = useMinigameStore((s) => s.mulliganActive);
  const requestExit = useMinigameStore((s) => s.requestExit);

  const visibleBuffs = activeBuffs.filter((b) => !b.consumed);
  // run 스코프(=전 라운드 지속) 버프만 pulse glow — 즉각적인 "지금 작동 중" 피드백.
  const isRunScoped = (id: string) =>
    id === "appraisal" || id === "doubleLoot" || id === "duplicateStash";

  return (
    <div
      className="sticky top-0 bg-bg-primary/90 backdrop-blur-sm border-b border-white/5"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        zIndex: "var(--z-hud)",
      }}
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
          <div
            className="flex items-center gap-1"
            role="status"
            aria-live="polite"
            aria-label={t("a11y.minigame.chances", {
              left: chancesLeft,
              total: Math.max(4, chancesLeft),
            }) || `${chancesLeft} chances left`}
          >
            {Array.from({ length: Math.max(4, chancesLeft) }).map((_, i) => {
              const isActive = i < chancesLeft;
              return (
                <motion.span
                  key={i}
                  className={isActive ? "" : "minigame-heart-empty-wrap"}
                  animate={{
                    opacity: isActive ? 1 : 0.4,
                    scale: isActive ? 1 : 0.88,
                  }}
                  transition={{ duration: 0.2 }}
                  aria-hidden="true"
                >
                  <PixelIcon
                    name="Heart"
                    size={20}
                    color={
                      isActive
                        ? "var(--color-heart-active)"
                        : "var(--color-heart-empty)"
                    }
                  />
                </motion.span>
              );
            })}
          </div>
          <AnimatePresence>
            {mulliganActive && (
              <motion.div
                key="mulligan-chip"
                initial={{ opacity: 0, scale: 0.94, x: -4 }}
                animate={
                  reduceMotion
                    ? { opacity: 1, scale: 1, x: 0 }
                    : {
                        opacity: 1,
                        scale: 1,
                        x: 0,
                        boxShadow: [
                          "0 0 0 rgba(155,240,225,0)",
                          "0 0 12px rgba(155,240,225,0.45)",
                          "0 0 0 rgba(155,240,225,0)",
                        ],
                      }
                }
                exit={{
                  opacity: 0,
                  scale: 0.94,
                  transition: { duration: 0.12 },
                }}
                transition={{
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.2 },
                  boxShadow: reduceMotion
                    ? undefined
                    : { duration: 2, repeat: Infinity, ease: "easeInOut" },
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-surface typo-micro text-accent-cyan whitespace-nowrap"
                style={{ border: "1px solid rgba(155,240,225,0.5)" }}
              >
                <PixelIcon name="Reload" size={12} />
                <span>{t("minigame.hud.mulliganActive")}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 나가기 — 44×44 hit-area 확보. aria-label 유지, 텍스트 레이블은 태블릿+에서만 */}
        <button
          onClick={requestExit}
          className="press-affordance flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2 rounded-lg hover:bg-bg-surface transition-colors"
          aria-label={t("a11y.minigame.exitRun")}
        >
          <PixelIcon name="Cancel" size={16} color="var(--text-secondary)" />
          <span className="hidden sm:inline typo-caption text-text-tertiary">
            {t("minigame.hud.exit")}
          </span>
        </button>
      </div>

      {/* 활성 버프 칩 — 아이콘 + 라벨로 의미 이중화. scale 1.25→1 과장 제거 */}
      {visibleBuffs.length > 0 && (
        <div
          className="px-4 pb-2 flex flex-wrap gap-1.5"
          role="status"
          aria-live="polite"
        >
          <AnimatePresence>
            {visibleBuffs.map((b, i) => {
              const def = REWARD_POOL.find((r) => r.id === b.effectId);
              if (!def) return null;
              const runScoped = isRunScoped(b.effectId);
              return (
                <motion.div
                  key={`${b.effectId}-${i}`}
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={
                    runScoped && !reduceMotion
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
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                  transition={
                    runScoped && !reduceMotion
                      ? {
                          opacity: { duration: 0.25 },
                          y: { duration: 0.25 },
                          scale: { type: "spring", stiffness: 380, damping: 22 },
                          boxShadow: {
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                          },
                        }
                      : {
                          scale: { type: "spring", stiffness: 380, damping: 22 },
                        }
                  }
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-surface border border-accent-secondary/30 typo-micro text-accent-secondary"
                >
                  <PixelIcon name="Sparkle" size={10} />
                  <span>{t(def.nameKey as "minigame.title")}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
