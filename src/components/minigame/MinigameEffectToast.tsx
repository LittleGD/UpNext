"use client";

import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { SKILL_DEFINITIONS, CURSE_DEFINITIONS } from "@/data/minigame";
import type { SkillEffectId, CurseEffectId } from "@/types/minigame";

/**
 * 스킬/저주가 발동했을 때 보드 상단 중앙에 2초간 뜨는 토스트.
 * useMinigameStore.lastEffectToast 를 구독해 표시 — 스토어가 타이머로 자동 해제한다.
 *
 * Phase 14 design review 변경:
 * - `role="status"` + `aria-live="polite"` — 스크린리더가 스킬/저주 발동을 읽는다.
 * - Raw hex 제거 → `var(--color-skill/curse)` 토큰.
 * - z-50 → `var(--z-toast)` 레이어 토큰.
 * - border 1.5px → 1px (보이지 않는 반픽셀 방지).
 * - enter/exit asymmetric: enter spring, exit 120ms ease-out (이탈은 빠르게).
 */
export default function MinigameEffectToast() {
  const { t } = useTranslation();
  const toast = useMinigameStore((s) => s.lastEffectToast);

  const def =
    toast?.kind === "skill"
      ? SKILL_DEFINITIONS[toast.id as SkillEffectId]
      : toast?.kind === "curse"
      ? CURSE_DEFINITIONS[toast.id as CurseEffectId]
      : null;

  const accentVar =
    toast?.kind === "curse" ? "var(--color-curse)" : "var(--color-skill)";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none"
    >
      <AnimatePresence>
        {toast && def && (
          <motion.div
            key={`${toast.kind}-${toast.id}-${toast.triggeredAt}`}
            initial={{ opacity: 0, y: -12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: -8,
              scale: 0.96,
              transition: { duration: 0.12, ease: "easeOut" },
            }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="fixed left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl bg-bg-surface/95 backdrop-blur-sm flex items-center gap-3 pointer-events-none"
            style={{
              top: "calc(env(safe-area-inset-top) + 72px)",
              border: `1px solid ${accentVar}`,
              boxShadow: `0 0 20px color-mix(in srgb, ${accentVar} 20%, transparent)`,
              maxWidth: "min(92vw, 360px)",
              zIndex: "var(--z-toast)" as unknown as number,
            }}
          >
            <div style={{ color: accentVar }}>
              <PixelIcon name={def.iconName} size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="typo-caption text-text-primary truncate">
                {t(def.nameKey as "minigame.title")}
              </p>
              <p className="typo-micro text-text-tertiary truncate">
                {t(def.descKey as "minigame.title")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
