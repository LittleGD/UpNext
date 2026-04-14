"use client";

import { motion } from "framer-motion";
import { memo } from "react";
import PixelIcon from "@/components/icons/PixelIcon";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { CATEGORY_ICONS } from "@/components/icons";
import { SKILL_DEFINITIONS } from "@/data/minigame";
import { cardTitle } from "@/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import CardBack from "./CardBack";
import type { MinigameTile as MinigameTileType } from "@/types/minigame";

interface MinigameTileProps {
  tile: MinigameTileType;
  sizePx: number;
  onTap: () => void;
  categoryHintActive: boolean;
  compassHinted: boolean;
  peekHinted: boolean;
  rarityBorder: boolean;
  echoGhostActive: boolean;
  disabled: boolean;
}

/**
 * 메모리 그리드의 단일 타일.
 * 3D 플립: isFaceUp에 따라 rotateY 180.
 * kind별 앞면 다르게 렌더:
 *   - challenge → RarityTexture + 카테고리 아이콘 + 카드명
 *   - skill     → 아이콘 + 효과 라벨
 *   - curse     → 자홍색 + 경고 글리프
 */
function MinigameTileInner({
  tile,
  sizePx,
  onTap,
  categoryHintActive,
  compassHinted,
  peekHinted,
  rarityBorder,
  echoGhostActive,
  disabled,
}: MinigameTileProps) {
  const isFaceUp = tile.isFaceUp || tile.isMatched;

  return (
    <motion.button
      type="button"
      onClick={disabled ? undefined : onTap}
      disabled={disabled}
      layoutId={tile.tileId}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      animate={{
        opacity: tile.isMatched ? 0.55 : 1,
      }}
      transition={{ duration: 0.2 }}
      className="relative w-full aspect-square"
      style={{
        perspective: 1000,
      }}
    >
      <motion.div
        className="relative w-full h-full"
        animate={{ rotateY: isFaceUp ? 180 : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* BACK */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden" }}
        >
          <CardBack
            tile={tile}
            sizePx={sizePx}
            categoryHintActive={categoryHintActive}
            compassHinted={compassHinted}
            peekHinted={peekHinted}
            rarityBorder={rarityBorder}
          />

          {/* Echo Ghost 잔상 — 앞면 아이콘 반투명 */}
          {echoGhostActive && !isFaceUp && (
            <motion.div
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              {tile.kind === "challenge" && tile.card && (
                <PixelIcon
                  name={tile.card.icon || CATEGORY_ICONS[tile.card.category]}
                  size={Math.max(18, sizePx * 0.45)}
                  color="#ffffff"
                />
              )}
              {tile.kind === "skill" && tile.skillId && (
                <PixelIcon
                  name={SKILL_DEFINITIONS[tile.skillId].iconName}
                  size={Math.max(18, sizePx * 0.45)}
                  color="#ffffff"
                />
              )}
              {tile.kind === "curse" && (
                <PixelIcon
                  name="WarningDiamond"
                  size={Math.max(18, sizePx * 0.45)}
                  color="#F037A5"
                />
              )}
            </motion.div>
          )}
        </div>

        {/* FRONT */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <TileFront tile={tile} sizePx={sizePx} />
        </div>
      </motion.div>
    </motion.button>
  );
}

function TileFront({
  tile,
  sizePx,
}: {
  tile: MinigameTileType;
  sizePx: number;
}) {
  const { language } = useTranslation();

  if (tile.kind === "challenge" && tile.card) {
    const rarity = tile.card.rarity;
    const color = RARITY_CONFIG[rarity].color;
    return (
      <div
        className="relative w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center p-1 gap-0.5"
        style={{
          background: "var(--bg-surface)",
          border: `2px solid ${color}`,
          boxShadow: rarityGlow(rarity),
        }}
      >
        <RarityTexture rarity={rarity} borderRadius={8} />
        <PixelIcon
          name={tile.card.icon || CATEGORY_ICONS[tile.card.category]}
          size={Math.max(18, sizePx * 0.38)}
          color={color}
        />
        <div
          className="typo-micro text-text-primary text-center leading-tight line-clamp-2 px-0.5"
          style={{ fontSize: Math.max(8, sizePx * 0.1) }}
        >
          {cardTitle(tile.card, language)}
        </div>
      </div>
    );
  }

  if (tile.kind === "skill" && tile.skillId) {
    const skill = SKILL_DEFINITIONS[tile.skillId];
    return (
      <div
        className="relative w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center p-1 gap-1"
        style={{
          background: "linear-gradient(135deg, #9BF0E1 0%, #5ed1ba 100%)",
          border: "2px solid #9BF0E1",
          boxShadow: "0 0 16px rgba(155, 240, 225, 0.5)",
        }}
      >
        <PixelIcon name={skill.iconName} size={Math.max(20, sizePx * 0.42)} color="#0A0A0A" />
        <div
          className="typo-micro text-center font-bold leading-tight"
          style={{ fontSize: Math.max(7, sizePx * 0.1), color: "#0A0A0A" }}
        >
          SKILL
        </div>
      </div>
    );
  }

  // curse
  return (
    <div
      className="relative w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center p-1 gap-1"
      style={{
        background: "linear-gradient(135deg, #F037A5 0%, #a8226f 100%)",
        border: "2px solid #F037A5",
        boxShadow: "0 0 20px rgba(240, 55, 165, 0.6)",
      }}
    >
      <PixelIcon name="WarningDiamond" size={Math.max(20, sizePx * 0.42)} color="#ffffff" />
      <div
        className="typo-micro text-center font-bold leading-tight text-white"
        style={{ fontSize: Math.max(7, sizePx * 0.1) }}
      >
        CURSE
      </div>
    </div>
  );
}

const MinigameTile = memo(MinigameTileInner);
export default MinigameTile;
