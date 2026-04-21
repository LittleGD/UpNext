"use client";

import { motion, useReducedMotion } from "framer-motion";
import { memo } from "react";
import PixelIcon from "@/components/icons/PixelIcon";
import RarityTexture from "@/components/cards/RarityTexture";
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
 *
 * Phase 14 design review 변경:
 * - raw hex 제거 → `var(--color-skill/curse/rarity-*)` 토큰 사용.
 * - 텍스트 최소 크기 상향(10–11px 하한). sizePx 가 그보다 너무 작으면 텍스트를
 *   숨기고 아이콘+색상만으로 정체성 전달 (색 단독 의존 방지 — 아이콘 shape 유지).
 * - 플립 400ms → 260ms (UI ceiling 300ms 준수). reduced-motion 시 회전 대신
 *   opacity 교차 페이드로 자동 전환 (framer MotionConfig 전역 정책이 처리).
 * - 레이어드 glow 는 `var(--glow-rarity-*)` intensity map 으로 일관화.
 * - Curse 는 상시 펄스 대신 CSS `.minigame-curse-breath` 2.4s opacity breath
 *   로 "저주가 살아있다" 감각만 남김 — 과한 scale pulse 제거.
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
  const { t, language } = useTranslation();
  const reduceMotion = useReducedMotion();
  const isFaceUp = tile.isFaceUp || tile.isMatched;

  // Phase 12 R9 — a11y: 카드 상태를 SR 에 전달.
  const cardLabel = (() => {
    if (tile.isMatched) return t("a11y.minigame.matched");
    if (isFaceUp) {
      const faceUp = t("a11y.minigame.faceUp");
      if (tile.kind === "challenge" && tile.card) {
        return `${faceUp} · ${cardTitle(tile.card, language)}`;
      }
      if (tile.kind === "skill") return `${faceUp} · ${t("a11y.minigame.skillCard")}`;
      if (tile.kind === "curse") return `${faceUp} · ${t("a11y.minigame.curseCard")}`;
      return faceUp;
    }
    return t("a11y.minigame.faceDown");
  })();

  return (
    <motion.button
      type="button"
      onClick={disabled ? undefined : onTap}
      disabled={disabled}
      layoutId={tile.tileId}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={{
        opacity: tile.isMatched ? 0.55 : 1,
      }}
      // opacity 만 단독 transition — layout 과 섞이지 않도록 범위 제한.
      transition={{ opacity: { duration: 0.2, ease: "easeOut" } }}
      className="relative w-full aspect-square"
      style={{
        perspective: 1000,
      }}
      aria-label={cardLabel}
      aria-pressed={isFaceUp && !tile.isMatched}
      aria-disabled={disabled || tile.isMatched}
    >
      <motion.div
        className="relative w-full h-full"
        animate={{ rotateY: isFaceUp ? 180 : 0 }}
        // 400ms → 260ms. easeOut 은 UI flip 에 적절 (ease-in 금지).
        transition={{
          duration: reduceMotion ? 0 : 0.26,
          ease: [0.23, 1, 0.32, 1],
        }}
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

          {/* Echo Ghost 잔상 — 앞면 아이콘 반투명. 페이드아웃 700→500ms 로 단축 */}
          {echoGhostActive && !isFaceUp && (
            <motion.div
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              {tile.kind === "challenge" && tile.card && (
                <PixelIcon
                  name={tile.card.icon || CATEGORY_ICONS[tile.card.category]}
                  size={Math.max(18, sizePx * 0.45)}
                  color="var(--text-primary)"
                />
              )}
              {tile.kind === "skill" && tile.skillId && (
                <PixelIcon
                  name={SKILL_DEFINITIONS[tile.skillId].iconName}
                  size={Math.max(18, sizePx * 0.45)}
                  color="var(--text-primary)"
                />
              )}
              {tile.kind === "curse" && (
                <PixelIcon
                  name="WarningDiamond"
                  size={Math.max(18, sizePx * 0.45)}
                  color="var(--color-curse)"
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
  const { t, language } = useTranslation();

  // 10px 하한: 이보다 작아야 하는 상황이면 아예 텍스트를 숨기고 아이콘으로만
  // 식별 — 뭉개진 글자 vs 깔끔한 픽토그램 중 후자가 낫다.
  const labelPx = Math.round(sizePx * 0.11);
  const showLabel = labelPx >= 10;
  const labelFontSize = Math.max(10, labelPx);

  if (tile.kind === "challenge" && tile.card) {
    const rarity = tile.card.rarity;
    const color = RARITY_CONFIG[rarity].color;
    // rarity glow intensity map — 토큰으로 일관화
    const glowVar =
      rarity === "legend"
        ? "var(--glow-rarity-legend)"
        : rarity === "unique"
        ? "var(--glow-rarity-unique)"
        : rarity === "rare"
        ? "var(--glow-rarity-rare)"
        : "var(--glow-rarity-common)";
    return (
      <div
        className="relative w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center p-1 gap-0.5"
        style={{
          background: "var(--bg-surface)",
          border: `2px solid ${color}`,
          boxShadow: glowVar,
        }}
      >
        <RarityTexture rarity={rarity} borderRadius={8} />
        <PixelIcon
          name={tile.card.icon || CATEGORY_ICONS[tile.card.category]}
          size={Math.max(18, sizePx * 0.38)}
          color={color}
        />
        {showLabel && (
          <div
            className="typo-micro text-text-primary text-center leading-tight line-clamp-2 px-0.5"
            style={{ fontSize: labelFontSize }}
          >
            {cardTitle(tile.card, language)}
          </div>
        )}
      </div>
    );
  }

  if (tile.kind === "skill" && tile.skillId) {
    const skill = SKILL_DEFINITIONS[tile.skillId];
    return (
      <div
        className="relative w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center p-1 gap-1"
        style={{
          background:
            "linear-gradient(135deg, var(--color-skill) 0%, var(--color-skill-strong) 100%)",
          border: "2px solid var(--color-skill)",
          boxShadow: "var(--glow-rarity-rare)",
        }}
      >
        <PixelIcon
          name={skill.iconName}
          size={Math.max(20, sizePx * 0.42)}
          color="var(--bg-primary)"
        />
        {showLabel && (
          <div
            className="typo-micro text-center font-bold leading-tight"
            style={{ fontSize: labelFontSize, color: "var(--bg-primary)" }}
          >
            {t("minigame.tile.skill")}
          </div>
        )}
      </div>
    );
  }

  // curse — .minigame-curse-breath 로 subtle opacity pulse (keyframes in globals)
  return (
    <div
      className="relative w-full h-full rounded-lg overflow-hidden flex flex-col items-center justify-center p-1 gap-1 minigame-curse-breath"
      style={{
        background:
          "linear-gradient(135deg, var(--color-curse) 0%, var(--color-curse-strong) 100%)",
        border: "2px solid var(--color-curse)",
        boxShadow: "var(--glow-rarity-unique)",
      }}
    >
      <PixelIcon
        name="WarningDiamond"
        size={Math.max(20, sizePx * 0.42)}
        color="var(--text-primary)"
      />
      {showLabel && (
        <div
          className="typo-micro text-center font-bold leading-tight text-white"
          style={{ fontSize: labelFontSize }}
        >
          {t("minigame.tile.curse")}
        </div>
      )}
    </div>
  );
}

const MinigameTile = memo(MinigameTileInner);
export default MinigameTile;
