"use client";

import { motion } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import type { UserProgress } from "@/types/game";
import { useTranslation } from "@/hooks/useTranslation";

interface MergeConflictDialogProps {
  localProgress: UserProgress;
  cloudProgress: UserProgress;
  onChooseLocal: () => void;
  onChooseCloud: () => void;
}

export default function MergeConflictDialog({
  localProgress,
  cloudProgress,
  onChooseLocal,
  onChooseCloud,
}: MergeConflictDialogProps) {
  const { t } = useTranslation();
  const localDays = localProgress.totalDaysCompleted;
  const cloudDays = cloudProgress.totalDaysCompleted;
  const recommend = cloudDays >= localDays ? "cloud" : "local";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.95 }}
        transition={springSnappy}
        className="w-full max-w-sm bg-bg-elevated rounded-xl p-6 space-y-4"
      >
        <div className="text-center">
          <h2 className="text-heading-2 text-text-primary">{t("auth.merge.heading")}</h2>
          <p className="text-sm text-text-secondary mt-1">
            {t("auth.merge.description")}
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={onChooseLocal}
            className={`w-full text-left p-4 rounded-lg transition-all ${
              recommend === "local"
                ? "bg-accent/10 grid-border-accent"
                : "bg-bg-surface grid-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">{t("auth.merge.useLocal")}</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Lv.{localProgress.level} · {localDays} {t("auth.merge.daysCompleted")} · {localProgress.xp} XP
                </p>
              </div>
              {recommend === "local" && (
                <span className="text-[10px] font-bold text-accent px-2 py-1 bg-accent/20 rounded-sm">
                  {t("common.recommended")}
                </span>
              )}
            </div>
          </button>

          <button
            onClick={onChooseCloud}
            className={`w-full text-left p-4 rounded-lg transition-all ${
              recommend === "cloud"
                ? "bg-accent/10 grid-border-accent"
                : "bg-bg-surface grid-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">{t("auth.merge.useCloud")}</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Lv.{cloudProgress.level} · {cloudDays} {t("auth.merge.daysCompleted")} · {cloudProgress.xp} XP
                </p>
              </div>
              {recommend === "cloud" && (
                <span className="text-[10px] font-bold text-accent px-2 py-1 bg-accent/20 rounded-sm">
                  {t("common.recommended")}
                </span>
              )}
            </div>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
