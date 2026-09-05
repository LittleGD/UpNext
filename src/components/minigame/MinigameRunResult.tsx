"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useGameStore } from "@/store/useGameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import RarityTexture from "@/components/cards/RarityTexture";
import { RARITY_CONFIG } from "@/data/rarityConfig";

const rarityGlowVar = (rarity: string) => {
  if (rarity === "legend") return "var(--glow-rarity-legend)";
  if (rarity === "unique") return "var(--glow-rarity-unique)";
  if (rarity === "rare") return "var(--glow-rarity-rare)";
  return "var(--glow-rarity-common)";
};
import { CATEGORY_ICONS } from "@/components/icons";
import PixelIcon from "@/components/icons/PixelIcon";
import { cardTitle } from "@/i18n";

/**
 * 매치된 챌린지 카드 중 1~2장을 선택 → 콜렉션/XP 지급.
 * Double Loot 버프 활성 시 2장.
 */
export default function MinigameRunResult() {
  const { t, language } = useTranslation();
  const matchedAllRun = useMinigameStore((s) => s.matchedAllRun);
  const doubleLootActive = useMinigameStore((s) => s.doubleLootActive);
  const roundsCleared = useMinigameStore((s) => s.roundsCleared);
  const pickRunReward = useMinigameStore((s) => s.pickRunReward);
  const unlockedIds = useGameStore((s) => s.progress.unlockedCardIds);

  // 기본 픽 수 = 클리어한 라운드 수 (1~3). Double Loot 활성이면 +1 flat.
  // 매치 후보 수와 store maxPicks 로직과 일치해야 함.
  const basePicks = Math.max(1, roundsCleared);
  const maxPicks = basePicks + (doubleLootActive ? 1 : 0);
  const [selected, setSelected] = useState<string[]>([]);
  // RunResult 2-스텝 zoom: 이미 선택된 카드를 재탭하면 확대 상세가 열린다.
  const [zoomedTileId, setZoomedTileId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    // 매치된 것 중 challenge만.
    // 정상 매치 1쌍은 tileId가 서로 다른 2장을 생성하므로 tileId로 dedupe하면
    // 같은 카드가 두 번 surface되고 Double Loot가 같은 페어의 양쪽 반쪽에 모두
    // 소비될 수 있음. card.id(= pairKey)로 dedupe해야 card identity 기준 1개.
    const uniq = new Map<string, (typeof matchedAllRun)[number]>();
    for (const t of matchedAllRun) {
      if (t.kind === "challenge" && t.card) {
        if (!uniq.has(t.card.id)) uniq.set(t.card.id, t);
      }
    }
    return Array.from(uniq.values());
  }, [matchedAllRun]);

  const toggle = (tileId: string) => {
    // 이미 선택된 카드를 다시 탭하면 선택 해제 대신 zoom 오버레이 오픈.
    if (selected.includes(tileId)) {
      setZoomedTileId(tileId);
      return;
    }
    setSelected((prev) => {
      if (prev.length >= maxPicks) return [prev[prev.length - 1], tileId].slice(-maxPicks);
      return [...prev, tileId];
    });
  };

  const deselectFromZoom = (tileId: string) => {
    setSelected((prev) => prev.filter((id) => id !== tileId));
    setZoomedTileId(null);
  };

  const zoomedTile = zoomedTileId
    ? candidates.find((c) => c.tileId === zoomedTileId)
    : null;

  const confirm = () => {
    if (selected.length === 0) return;
    pickRunReward(selected);
  };

  // 매치 0장: 빈 상태
  if (candidates.length === 0) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center justify-center min-h-[80vh] px-6 gap-6"
      >
        <motion.h2 variants={fadeInUp} className="typo-display text-text-primary">
          {t("minigame.runResult.heading")}
        </motion.h2>
        <motion.p variants={fadeInUp} className="typo-body text-text-secondary text-center">
          {t("minigame.runResult.noMatches")}
        </motion.p>
        <motion.button
          variants={fadeInUp}
          onClick={() => pickRunReward([])}
          whileTap={{ scale: 0.97 }}
          className="press-affordance min-h-[48px] px-6 rounded-lg bg-accent text-bg-primary typo-body transition-[filter] duration-200 ease-out hover:brightness-110"
        >
          {t("minigame.summary.exit")}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="min-h-screen px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+120px)] flex flex-col gap-4"
    >
      <motion.div variants={fadeInUp} className="text-center">
        <h2 className="typo-display text-text-primary mb-1">
          {t("minigame.runResult.heading")}
        </h2>
        <p className="typo-caption text-text-tertiary">
          {t("minigame.runResult.pickN", { count: maxPicks })}
        </p>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="grid grid-cols-3 gap-3 max-w-md mx-auto w-full"
      >
        {candidates.map((tile) => {
          if (!tile.card) return null;
          const isSelected = selected.includes(tile.tileId);
          const owned = unlockedIds.includes(tile.card.id);
          const color = RARITY_CONFIG[tile.card.rarity].color;
          return (
            <motion.button
              key={tile.tileId}
              layoutId={`runresult-${tile.tileId}`}
              whileTap={{ scale: 0.97 }}
              onClick={() => toggle(tile.tileId)}
              aria-pressed={isSelected}
              aria-label={`${cardTitle(tile.card, language)}${isSelected ? ", selected" : ""}`}
              className="relative aspect-[3/4] rounded-lg overflow-hidden transition-[box-shadow,opacity] duration-200 ease-out"
              style={{
                background: "var(--bg-surface)",
                border: `2px solid ${isSelected ? color : "rgba(255,255,255,0.1)"}`,
                boxShadow: isSelected ? rarityGlowVar(tile.card.rarity) : "none",
                opacity: isSelected ? 1 : 0.8,
              }}
            >
              {/* 선택 체크 배지 — 색 + shape 이중화 (색약 대응) */}
              {isSelected && (
                <span
                  className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: color,
                    color: "var(--bg-primary)",
                  }}
                  aria-hidden="true"
                >
                  <PixelIcon name="Check" size={12} />
                </span>
              )}
              <RarityTexture rarity={tile.card.rarity} borderRadius={8} />
              <div className="relative flex flex-col items-center justify-center h-full p-2 gap-1">
                <PixelIcon
                  name={tile.card.icon || CATEGORY_ICONS[tile.card.category]}
                  size={28}
                  color={color}
                />
                <p className="typo-micro text-text-primary text-center line-clamp-2 leading-tight">
                  {cardTitle(tile.card, language)}
                </p>
                {owned && (
                  <span className="typo-micro text-text-tertiary">
                    {t("minigame.summary.duplicate")}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      <div
        className="fixed left-0 right-0 bottom-0 bg-bg-primary/95 backdrop-blur-sm border-t border-white/5 px-4 py-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <button
          onClick={confirm}
          disabled={selected.length === 0}
          aria-disabled={selected.length === 0}
          className={`press-affordance w-full min-h-[48px] rounded-lg typo-body transition-[background-color,filter] duration-200 ease-out ${
            selected.length > 0
              ? "bg-accent text-bg-primary hover:brightness-110"
              : "bg-bg-elevated text-text-tertiary cursor-not-allowed"
          }`}
        >
          {t("common.confirm")} ({selected.length}/{maxPicks})
        </button>
      </div>

      {/* 2-스텝 zoom 오버레이 — 이미 선택된 카드를 재탭하면 열림 */}
      <AnimatePresence>
        {zoomedTile && zoomedTile.card && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="fixed inset-0 flex items-center justify-center bg-bg-primary/90 backdrop-blur-md px-8"
            style={{ zIndex: "var(--z-run-zoom)" as unknown as number }}
            onClick={() => setZoomedTileId(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              layoutId={`runresult-${zoomedTile.tileId}`}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[220px] aspect-[3/4] rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-3 p-5"
              style={{
                background: "var(--bg-surface)",
                border: `2px solid ${RARITY_CONFIG[zoomedTile.card.rarity].color}`,
                boxShadow: rarityGlowVar(zoomedTile.card.rarity),
              }}
            >
              <RarityTexture rarity={zoomedTile.card.rarity} borderRadius={16} />
              <div className="relative flex flex-col items-center gap-3">
                <PixelIcon
                  name={zoomedTile.card.icon || CATEGORY_ICONS[zoomedTile.card.category]}
                  size={56}
                  color={RARITY_CONFIG[zoomedTile.card.rarity].color}
                />
                <p className="typo-body text-text-primary text-center">
                  {cardTitle(zoomedTile.card, language)}
                </p>
              </div>
            </motion.div>
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => {
                e.stopPropagation();
                deselectFromZoom(zoomedTile.tileId);
              }}
              className="press-affordance absolute bottom-[calc(env(safe-area-inset-bottom)+120px)] left-1/2 -translate-x-1/2 min-h-[44px] px-5 rounded-lg bg-bg-surface typo-caption text-text-primary grid-border"
            >
              {t("minigame.runResult.deselect")}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
