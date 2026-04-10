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

  const borderColor = toast?.kind === "curse" ? "#F037A5" : "#9BF0E1";

  return (
    <AnimatePresence>
      {toast && def && (
        <motion.div
          key={`${toast.kind}-${toast.id}-${toast.triggeredAt}`}
          initial={{ opacity: 0, y: -12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-bg-surface/95 backdrop-blur-sm flex items-center gap-3 pointer-events-none"
          style={{
            top: "calc(env(safe-area-inset-top) + 72px)",
            border: `1.5px solid ${borderColor}`,
            boxShadow: `0 0 20px ${borderColor}22`,
            maxWidth: "min(92vw, 360px)",
          }}
        >
          <div style={{ color: borderColor }}>
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
  );
}
