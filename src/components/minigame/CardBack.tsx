"use client";

import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { CATEGORY_ICONS } from "@/components/icons";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import type { MinigameTile } from "@/types/minigame";

interface CardBackProps {
  tile: MinigameTile;
  sizePx: number;
  categoryHintActive: boolean;
  compassHinted: boolean;
  peekHinted: boolean;           // scout's eye / peek2
  rarityBorder: boolean;         // compass 보상 활성 시 뒷면에 rarity 테두리
}

/**
 * 카드 뒷면 — 메모리 그리드에서 뒤집힌 상태일 때 렌더.
 * 기본은 불투명 픽셀 패턴. 카테고리 힌트/컴파스/픽 시에만 카테고리 아이콘 페이드인.
 * 스킬/저주 뒷면은 일반 뒷면과 100% 동일 (구별 금지 — 난이도 설계).
 */
export default function CardBack({
  tile,
  sizePx,
  categoryHintActive,
  compassHinted,
  peekHinted,
  rarityBorder,
}: CardBackProps) {
  // 카테고리 아이콘 결정 — challenge일 때만 유의미. skill/curse는 힌트 대상 아님
  const hintIcon =
    tile.kind === "challenge" && tile.card
      ? CATEGORY_ICONS[tile.card.category]
      : null;

  const showHint =
    hintIcon !== null && (categoryHintActive || compassHinted);

  // Rarity 테두리 (Compass 보상) — challenge만
  const borderColor =
    rarityBorder && tile.kind === "challenge" && tile.card
      ? RARITY_CONFIG[tile.card.rarity].color
      : "rgba(255,255,255,0.08)";

  return (
    <div
      className="relative w-full h-full rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-elevated)",
        border: `2px solid ${borderColor}`,
      }}
    >
      {/* 픽셀 패턴 배경 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            rgba(255,255,255,0.02) 0px,
            rgba(255,255,255,0.02) 2px,
            transparent 2px,
            transparent 6px
          )`,
        }}
      />

      {/* 중앙 마크 */}
      {!showHint && !peekHinted && (
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <PixelIcon name="Card" size={Math.max(16, sizePx * 0.4)} color="#ffffff" />
        </div>
      )}

      {/* 카테고리 힌트 페이드인 (플래시/컴파스) */}
      {showHint && hintIcon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.85, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <PixelIcon name={hintIcon} size={Math.max(20, sizePx * 0.5)} color="#9BF0E1" />
        </motion.div>
      )}

      {/* Peek 힌트 (scout's eye / peek2) — 뒷면 살짝 밝게 */}
      {peekHinted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          className="absolute inset-0 bg-white pointer-events-none"
        />
      )}
    </div>
  );
}
