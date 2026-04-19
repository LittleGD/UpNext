"use client";

import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 몰입 모드 Exit 진입점 + 확인 프롬프트.
 *
 * - HUD가 없는 phase(roundResult/rewardDraft/runResult)에서 우상단 X 버튼 표시.
 * - HUD의 X 버튼도 이 컴포넌트의 confirm 모달을 공유한다(store.exitConfirmOpen).
 * - runComplete에는 이미 명시적 Exit/Play Again 버튼이 있으므로 오버레이 X는 생략.
 */
interface MinigameExitOverlayProps {
  /** HUD가 있는 phase(playing 등)에서는 상단 X 버튼을 렌더하지 않는다. 확인 모달만 공유. */
  hideTopRightButton?: boolean;
}

export default function MinigameExitOverlay({
  hideTopRightButton = false,
}: MinigameExitOverlayProps) {
  const { t } = useTranslation();
  const phase = useMinigameStore((s) => s.phase);
  const exitConfirmOpen = useMinigameStore((s) => s.exitConfirmOpen);
  const requestExit = useMinigameStore((s) => s.requestExit);
  const cancelExit = useMinigameStore((s) => s.cancelExit);
  const exitRun = useMinigameStore((s) => s.exitRun);

  if (phase === "idle" || phase === "runComplete") return null;

  return (
    <>
      {!hideTopRightButton && (
        <button
          onClick={requestExit}
          aria-label={t("a11y.minigame.exitRun")}
          className="fixed right-4 z-50 p-2 rounded-lg bg-bg-surface/80 backdrop-blur-sm border border-white/10 hover:bg-bg-surface transition-colors"
          style={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
        >
          <PixelIcon name="Cancel" size={18} color="#B8B8B8" />
        </button>
      )}

      <AnimatePresence>
        {exitConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm px-6"
            onClick={cancelExit}
          >
            <motion.div
              initial={{ scale: 0.9, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 8 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs bg-bg-surface rounded-xl p-6 grid-border flex flex-col gap-4"
            >
              <div className="text-center">
                <h3 className="typo-heading text-text-primary mb-1">
                  {t("minigame.exit.confirmTitle")}
                </h3>
                <p className="typo-caption text-text-tertiary">
                  {t("minigame.exit.confirmDesc")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cancelExit}
                  className="flex-1 py-3 rounded-lg bg-bg-elevated text-text-primary typo-body"
                >
                  {t("minigame.exit.confirmNo")}
                </button>
                <button
                  onClick={exitRun}
                  className="flex-1 py-3 rounded-lg bg-accent-secondary text-bg-primary typo-body"
                >
                  {t("minigame.exit.confirmYes")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
