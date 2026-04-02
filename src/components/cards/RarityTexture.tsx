"use client";

import { RARITY_CONFIG } from "@/data/rarityConfig";
import { motion } from "framer-motion";
import type { Rarity } from "@/types/card";

interface RarityTextureProps {
  rarity: Rarity;
  borderRadius?: number;
}

/**
 * Overlay texture that visually differentiates card rarities.
 * Place inside a `position: relative; overflow: hidden` container.
 * Normal rarity renders nothing.
 */
export default function RarityTexture({ rarity, borderRadius = 8 }: RarityTextureProps) {
  if (rarity === "normal") return null;

  const { color } = RARITY_CONFIG[rarity];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ borderRadius }}>
      {/* --- RARE: diagonal lines + edge glow --- */}
      {rarity === "rare" && (
        <>
          <div style={{
            position: "absolute", inset: 0, opacity: 0.03,
            backgroundImage: `repeating-linear-gradient(
              135deg,
              ${color} 0px, ${color} 1px,
              transparent 1px, transparent 14px
            )`,
          }} />
          <div style={{
            position: "absolute", inset: 0,
            background: `
              radial-gradient(ellipse at 0% 0%, ${color}08 0%, transparent 50%),
              radial-gradient(ellipse at 100% 100%, ${color}08 0%, transparent 50%)
            `,
          }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent 10%, ${color}20 50%, transparent 90%)`,
          }} />
        </>
      )}

      {/* --- UNIQUE: honeycomb + double frame + corner jewels + shimmer --- */}
      {rarity === "unique" && (
        <>
          <div style={{
            position: "absolute", inset: 0, opacity: 0.035,
            backgroundImage: `
              radial-gradient(circle at 12px 0px, ${color} 1.5px, transparent 1.5px),
              radial-gradient(circle at 0px 10px, ${color} 1.5px, transparent 1.5px)
            `,
            backgroundSize: "24px 20px",
          }} />
          <div style={{
            position: "absolute", inset: 5, borderRadius: Math.max(borderRadius - 3, 4),
            border: `1px solid ${color}14`,
            boxShadow: `inset 0 0 30px ${color}08`,
          }} />
          <div style={{
            position: "absolute", inset: 10, borderRadius: Math.max(borderRadius - 6, 2),
            border: `1px solid ${color}08`,
          }} />
          {[
            { top: 6, left: 6, transform: "none" },
            { top: 6, right: 6, transform: "scaleX(-1)" },
            { bottom: 6, left: 6, transform: "scaleY(-1)" },
            { bottom: 6, right: 6, transform: "scale(-1, -1)" },
          ].map((pos, i) => (
            <svg key={i} width="26" height="26" viewBox="0 0 26 26" style={{ position: "absolute", ...pos, opacity: 0.14 } as React.CSSProperties}>
              <path d="M0 0L10 0L0 10Z" fill={color} />
              <path d="M0 16L16 0" stroke={color} strokeWidth="0.5" opacity="0.5" />
              <path d="M0 22L22 0" stroke={color} strokeWidth="0.5" opacity="0.25" />
              <circle cx="3" cy="3" r="1.2" fill={color} opacity="0.7" />
            </svg>
          ))}
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
            style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(105deg, transparent 40%, ${color}06 48%, ${color}10 50%, ${color}06 52%, transparent 60%)`,
            }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: `
              radial-gradient(ellipse at 0% 0%, ${color}0a 0%, transparent 45%),
              radial-gradient(ellipse at 100% 100%, ${color}0a 0%, transparent 45%),
              radial-gradient(ellipse at 100% 0%, ${color}06 0%, transparent 35%)
            `,
          }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent 5%, ${color}35 50%, transparent 95%)`,
          }} />
        </>
      )}

      {/* --- LEGEND: diamond grid + double frame + corner accents + animated shimmer + premium glow --- */}
      {rarity === "legend" && (
        <>
          <div style={{
            position: "absolute", inset: 0, opacity: 0.03,
            backgroundImage: `
              linear-gradient(45deg, ${color} 25%, transparent 25%),
              linear-gradient(-45deg, ${color} 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, ${color} 75%),
              linear-gradient(-45deg, transparent 75%, ${color} 75%)
            `,
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
          }} />
          <div style={{
            position: "absolute", inset: 5, borderRadius: Math.max(borderRadius - 3, 4),
            border: `1px solid ${color}15`,
          }} />
          <div style={{
            position: "absolute", inset: 10, borderRadius: Math.max(borderRadius - 6, 2),
            border: `1px solid ${color}0a`,
          }} />
          {[
            { top: 6, left: 6, transform: "none" },
            { top: 6, right: 6, transform: "scaleX(-1)" },
            { bottom: 6, left: 6, transform: "scaleY(-1)" },
            { bottom: 6, right: 6, transform: "scale(-1, -1)" },
          ].map((pos, i) => (
            <svg key={i} width="28" height="28" viewBox="0 0 28 28" style={{ position: "absolute", ...pos, opacity: 0.15 } as React.CSSProperties}>
              <path d="M0 0L10 0L0 10Z" fill={color} />
              <path d="M0 14L14 0" stroke={color} strokeWidth="0.5" opacity="0.5" />
              <path d="M0 20L20 0" stroke={color} strokeWidth="0.5" opacity="0.3" />
              <circle cx="3" cy="3" r="1" fill={color} opacity="0.8" />
            </svg>
          ))}
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
            style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(105deg, transparent 40%, ${color}08 48%, ${color}12 50%, ${color}08 52%, transparent 60%)`,
            }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: `
              radial-gradient(ellipse at 0% 0%, ${color}0c 0%, transparent 40%),
              radial-gradient(ellipse at 100% 0%, ${color}0c 0%, transparent 40%),
              radial-gradient(ellipse at 50% 100%, ${color}08 0%, transparent 40%)
            `,
          }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent 2%, ${color}40 50%, transparent 98%)`,
          }} />
        </>
      )}
    </div>
  );
}

/** Returns a boxShadow string for rarity-based outer glow. Returns undefined for normal. */
export function rarityGlow(rarity: Rarity): string | undefined {
  if (rarity === "normal") return undefined;
  const { color } = RARITY_CONFIG[rarity];
  if (rarity === "legend") return `0 0 24px ${color}12, 0 0 2px ${color}18`;
  if (rarity === "unique") return `0 0 16px ${color}0c, 0 0 1px ${color}14`;
  return `0 0 12px ${color}08`;
}
