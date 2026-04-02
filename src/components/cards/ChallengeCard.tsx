"use client";

import type { ChallengeCard as CardType } from "@/types/card";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { stampIn, springSnappy } from "@/lib/motion";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, cardDesc } from "@/i18n";
import RarityTexture, { rarityGlow } from "@/components/cards/RarityTexture";

interface ChallengeCardProps {
  card: CardType;
  isSelected?: boolean;
  isCompleted?: boolean;
  onSelect?: () => void;
  onComplete?: () => void;
  disabled?: boolean;
}

export default function ChallengeCard({
  card,
  isSelected = false,
  isCompleted = false,
  onSelect,
  onComplete,
  disabled = false,
}: ChallengeCardProps) {
  const rarity = RARITY_CONFIG[card.rarity];
  const { language } = useTranslation();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={springSnappy}
      onClick={() => {
        if (disabled) return;
        if (isCompleted) return;
        if (onComplete && isSelected) {
          onComplete();
          return;
        }
        onSelect?.();
      }}
      className={`
        relative w-full rounded-lg p-4 cursor-pointer
        transition-all duration-200
        ${rarity.bgClass}
        ${isCompleted ? "opacity-60" : ""}
        ${disabled ? "cursor-default opacity-40" : "hover:bg-bg-elevated"}
      `}
      style={!isCompleted ? { boxShadow: rarityGlow(card.rarity) } : undefined}
    >
      {!isCompleted && <RarityTexture rarity={card.rarity} />}
      {/* 등급 배지 */}
      <div
        className="absolute -top-2 -right-2 text-[13px] font-bold px-2 py-0.5 rounded-sm"
        style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
      >
        {rarityLabel(card.rarity, language)}
      </div>

      {/* 카드 내용 */}
      <div className="flex items-start gap-3">
        <PixelIcon name={card.icon} size={28} color={rarity.color} />
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-text-primary ${isCompleted ? "line-through" : ""}`}>
            {cardTitle(card, language)}
          </h3>
          <p className="text-sm text-text-secondary mt-0.5">{cardDesc(card, language)}</p>
        </div>
      </div>

      {/* 완료 체크 */}
      {isCompleted && (
        <motion.div
          variants={stampIn}
          initial="hidden"
          animate="visible"
          className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg"
        >
          <PixelIcon name="Check" size={48} color="var(--accent-primary)" />
        </motion.div>
      )}
    </motion.div>
  );
}
