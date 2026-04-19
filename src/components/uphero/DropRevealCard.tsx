"use client";

/**
 * Up Hero — DropRevealCard.
 *
 * 세션 종료 후 획득한 장비를 한 장씩 flip 애니메이션으로 공개.
 * 3D rotateY 로 카드 뒤집기. 탭하면 반대면 보여줌.
 *
 * 초기 상태: 뒷면 (rarity 오라 + ? 마크)
 * 탭 후: 앞면 (EquipmentCard lg)
 *
 * interaction: 한 번 뒤집으면 고정 (다시 뒤집기 불가).
 */

import { useState } from "react";
import type { Equipment } from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import EquipmentCard from "./EquipmentCard";
import RarityTexture from "@/components/cards/RarityTexture";

interface DropRevealCardProps {
  equipment: Equipment;
  /** 초기부터 펼쳐진 상태 (reveal 된 것) */
  initiallyRevealed?: boolean;
}

const RARITY_COLOR: Record<Equipment["rarity"], string> = {
  normal: GB.light,
  rare: "#a5c8db",
  unique: "#cdb887",
  legend: "#e8b887",
};

export default function DropRevealCard({
  equipment,
  initiallyRevealed = false,
}: DropRevealCardProps) {
  const [revealed, setRevealed] = useState(initiallyRevealed);
  const rarityColor = RARITY_COLOR[equipment.rarity];

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      disabled={revealed}
      className="drop-reveal-card"
      style={{
        width: 120,
        height: 160,
        perspective: 600,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: revealed ? "default" : "pointer",
      }}
    >
      <div
        className="relative w-full h-full"
        style={{
          transformStyle: "preserve-3d",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: `transform 520ms ${EASE_OUT}`,
        }}
      >
        {/* === 뒷면 === */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-md overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: `${GB.dark}cc`,
            border: `1px solid ${rarityColor}`,
          }}
        >
          <RarityTexture rarity={equipment.rarity} borderRadius={8} />
          {/* Phase 9c — "?" 호흡. campfire flicker 와 동일 4.2s 주기 —
               "아직 열리지 않은 상자" tension. reduced-motion 에선 정적. */}
          <div
            className="uphero-fire-flicker typo-title"
            style={{
              color: rarityColor,
              textShadow: `0 0 8px color-mix(in srgb, ${rarityColor} 40%, transparent)`,
            }}
          >
            ?
          </div>
        </div>

        {/* === 앞면 === */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <EquipmentCard equipment={equipment} size="md" />
        </div>
      </div>

      <style jsx>{`
        .drop-reveal-card {
          transition: transform 120ms ${EASE_OUT};
        }
        .drop-reveal-card:not(:disabled):active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}
