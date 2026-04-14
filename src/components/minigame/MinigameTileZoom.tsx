"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMinigameStore } from "@/store/useMinigameStore";
import PixelIcon from "@/components/icons/PixelIcon";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { CATEGORY_ICONS } from "@/components/icons";
import { SKILL_DEFINITIONS } from "@/data/minigame";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";

/**
 * 재탭 확대 — zoomedTileIdx가 설정되면 풀스크린 오버레이로 타일을 확대 표시.
 * 5×4 그리드에서 챌린지 설명 가독성 확보용.
 */
export default function MinigameTileZoom() {
  const { t, language } = useTranslation();
  const zoomedIdx = useMinigameStore((s) => s.zoomedTileIdx);
  const board = useMinigameStore((s) => s.board);
  const flipCard = useMinigameStore((s) => s.flipCard);

  const tile = zoomedIdx !== null ? board[zoomedIdx] : null;

  return (
    <AnimatePresence>
      {tile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => flipCard(zoomedIdx!)}
        >
          <motion.div
            layoutId={tile.tileId}
            className="relative w-full max-w-xs aspect-[3/4] rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border: `3px solid ${
                tile.kind === "challenge" && tile.card
                  ? RARITY_CONFIG[tile.card.rarity].color
                  : tile.kind === "skill"
                    ? "#9BF0E1"
                    : "#F037A5"
              }`,
              boxShadow:
                tile.kind === "challenge" && tile.card
                  ? rarityGlow(tile.card.rarity)
                  : "0 0 30px rgba(155,240,225,0.4)",
            }}
          >
            {tile.kind === "challenge" && tile.card && (
              <>
                <RarityTexture rarity={tile.card.rarity} borderRadius={12} />
                <div className="relative flex flex-col items-center justify-center h-full p-6 gap-4">
                  <PixelIcon
                    name={tile.card.icon || CATEGORY_ICONS[tile.card.category]}
                    size={72}
                    color={RARITY_CONFIG[tile.card.rarity].color}
                  />
                  <h3 className="typo-title text-text-primary text-center">
                    {cardTitle(tile.card, language)}
                  </h3>
                  <p className="typo-caption text-text-secondary text-center">
                    {cardDesc(tile.card, language)}
                  </p>
                </div>
              </>
            )}

            {tile.kind === "skill" && tile.skillId && (
              <div
                className="flex flex-col items-center justify-center h-full p-6 gap-4"
                style={{
                  background:
                    "linear-gradient(135deg, #9BF0E1 0%, #5ed1ba 100%)",
                }}
              >
                <PixelIcon
                  name={SKILL_DEFINITIONS[tile.skillId].iconName}
                  size={72}
                  color="#0A0A0A"
                />
                <h3
                  className="typo-title text-center"
                  style={{ color: "#0A0A0A" }}
                >
                  {t(SKILL_DEFINITIONS[tile.skillId].nameKey as "minigame.title")}
                </h3>
                <p
                  className="typo-caption text-center"
                  style={{ color: "#0A0A0A" }}
                >
                  {t(SKILL_DEFINITIONS[tile.skillId].descKey as "minigame.title")}
                </p>
              </div>
            )}

            {tile.kind === "curse" && (
              <div
                className="flex flex-col items-center justify-center h-full p-6 gap-4"
                style={{
                  background:
                    "linear-gradient(135deg, #F037A5 0%, #a8226f 100%)",
                }}
              >
                <PixelIcon name="WarningDiamond" size={72} color="#ffffff" />
                <h3 className="typo-title text-center text-white">
                  {t("minigame.curse.triggered")}
                </h3>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
