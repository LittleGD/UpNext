"use client";

/**
 * CollectionCelebration — 처음으로 모든 카드를 모은 순간 1회성 축하 모달.
 *
 *  트리거: useGameStore.collectionCelebration === true
 *  닫힘:   사용자가 확인 → dismissCollectionCelebration() → false 로
 *
 *  보상은 store 가 미리 처리 (xp + 영웅 코인 + 칭호 자동 부여).
 *  이 컴포넌트는 시각/축하 메시지 전담.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import PixelIcon from "@/components/icons/PixelIcon";
import { ALL_CARDS } from "@/data/cards";
import { COLLECTION_FIRST_CLEAR_BONUS } from "@/data/packTier";
import { GB } from "@/lib/upHeroPalette";

export default function CollectionCelebration() {
  const visible = useGameStore((s) => s.collectionCelebration);
  const dismiss = useGameStore((s) => s.dismissCollectionCelebration);
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { play } = useSound();

  useEffect(() => {
    if (!visible) return;
    play("xpGain");
  }, [visible, play]);

  if (!visible) return null;

  // 트로피 주변 방사형 광선 (reduced-motion 시 생략)
  const rayCount = reducedMotion ? 0 : 12;
  const accent = GB.lightest;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[80] flex items-center justify-center p-6"
        style={{ background: "rgba(0, 0, 0, 0.85)" }}
        onClick={dismiss}
      >
        {/* 방사형 광선 */}
        {rayCount > 0 && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {Array.from({ length: rayCount }).map((_, i) => {
              const angle = (i / rayCount) * 360;
              return (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: [0, 0.6, 0.3] }}
                  transition={{ duration: 1.2, delay: 0.2 + i * 0.04, ease: "easeOut" }}
                  className="absolute origin-bottom"
                  style={{
                    width: 4,
                    height: 220,
                    background: `linear-gradient(to top, ${accent}, transparent)`,
                    transform: `rotate(${angle}deg) translateY(-110px)`,
                    transformOrigin: "center bottom",
                  }}
                />
              );
            })}
          </div>
        )}

        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
          className="relative max-w-sm w-full rounded-2xl p-6 flex flex-col items-center gap-4 grid-border"
          style={{ background: "rgba(10, 31, 10, 0.96)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 트로피 아이콘 — pulse */}
          <motion.div
            animate={reducedMotion ? {} : { scale: [1, 1.08, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ color: accent }}
          >
            <PixelIcon name="Trophy" size={72} />
          </motion.div>

          {/* 제목 */}
          <h2
            className="typo-display text-center"
            style={{ color: accent }}
          >
            {t("cards.collectionComplete.title")}
          </h2>

          {/* 본문 */}
          <p className="typo-body text-text-primary text-center leading-snug">
            {t("cards.collectionComplete.body", { count: ALL_CARDS.length })}
          </p>

          {/* 칭호 부여 안내 */}
          <div
            className="w-full rounded-md p-3 flex items-center gap-3"
            style={{ background: "rgba(205, 245, 100, 0.12)", border: `1px solid ${accent}33` }}
          >
            <PixelIcon name="Trophy" size={20} color={accent} />
            <div className="flex-1 min-w-0">
              <p className="typo-caption font-semibold" style={{ color: accent }}>
                {t("cards.collectionComplete.titleAwarded")}
              </p>
              <p className="typo-caption text-text-secondary">
                {t("title.collectionMaster.name")}
              </p>
            </div>
          </div>

          {/* 보너스 보상 */}
          <div className="w-full grid grid-cols-2 gap-2">
            <div className="rounded-md p-3 bg-bg-elevated flex flex-col items-center gap-1">
              <span className="typo-caption text-text-tertiary">XP</span>
              <span className="typo-body font-bold tabular-nums" style={{ color: accent }}>
                +{COLLECTION_FIRST_CLEAR_BONUS.xp}
              </span>
            </div>
            <div className="rounded-md p-3 bg-bg-elevated flex flex-col items-center gap-1">
              <span className="typo-caption text-text-tertiary">{t("cards.collectionComplete.coinsLabel")}</span>
              <span className="typo-body font-bold tabular-nums" style={{ color: accent }}>
                +{COLLECTION_FIRST_CLEAR_BONUS.coins}
              </span>
            </div>
          </div>

          {/* 확인 버튼 */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            whileTap={{ scale: 0.97 }}
            onClick={dismiss}
            className="w-full px-6 py-3 bg-accent text-bg-primary rounded-md typo-body font-semibold"
          >
            {t("common.confirm")}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
