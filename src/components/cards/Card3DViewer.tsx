"use client";

import { useMemo, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import type { ChallengeCard } from "@/types/card";
import type { Language } from "@/types/game";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { rarityLabel } from "@/data/rarityConfig";
import { categoryLabel, CATEGORY_ICONS } from "@/data/titles";
import { cardTitle, cardDesc } from "@/i18n";
import { getCardQuote } from "@/data/quotePool";
import { useGameStore } from "@/store/useGameStore";
import { useDragRotate } from "@/hooks/useDragRotate";
import { useGyroscope } from "@/hooks/useGyroscope";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import RarityTexture, { rarityGlow } from "./RarityTexture";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";

interface Card3DViewerProps {
  card: ChallengeCard;
  language: Language;
}

export default function Card3DViewer({ card, language }: Card3DViewerProps) {
  const { play } = useSound();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const rarity = RARITY_CONFIG[card.rarity];
  const glow = rarityGlow(card.rarity);
  const categoryIcon = CATEGORY_ICONS[card.category] || "Sparkle";
  const completions = useGameStore((s) => s.progress.cardCompletions?.[card.id] || 0);

  // ── 3D 드래그 ──
  const {
    rotateX: dragRotateX,
    rotateY: dragRotateY,
    isDragging,
    handlers,
  } = useDragRotate(() => play("cardHover"));

  // ── 자이로 (MotionValue — 리렌더 없이 60fps) ──
  const gyro = useGyroscope();

  // ── 드래그 + 자이로 합성 ──
  // 모든 입력이 MotionValue 이므로 re-render 없이 60fps 유지
  const combinedX = useMotionValue(0);
  const combinedY = useMotionValue(0);

  // isDragging을 ref로 추적 — 구독 useEffect의 deps에서 제외하여
  // 드래그 시작/종료 시 4개 MotionValue 구독이 tear down/recreate 되는 것을 방지.
  // 구독 재설정 사이 한 프레임 동안 자이로 값이 bleed-through 되던 문제 해소.
  const isDraggingRef = useRef(false);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  useEffect(() => {
    const update = () => {
      const gx = isDraggingRef.current ? 0 : gyro.beta.get();
      const gy = isDraggingRef.current ? 0 : gyro.gamma.get();
      combinedX.set(dragRotateX.get() + gx);
      combinedY.set(dragRotateY.get() + gy);
    };

    const unsubs = [
      dragRotateX.on("change", update),
      dragRotateY.on("change", update),
      gyro.beta.on("change", update),
      gyro.gamma.on("change", update),
    ];
    update();
    return () => unsubs.forEach((u) => u());
  }, [dragRotateX, dragRotateY, gyro.beta, gyro.gamma, combinedX, combinedY]);

  // isDragging 변경 시 즉시 반영 (구독 재설정 없이)
  useEffect(() => {
    const gx = isDragging ? 0 : gyro.beta.get();
    const gy = isDragging ? 0 : gyro.gamma.get();
    combinedX.set(dragRotateX.get() + gx);
    combinedY.set(dragRotateY.get() + gy);
  }, [isDragging]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 홀로그래픽 효과용 derived values ──
  const holoAngle = useTransform(combinedY, (v) => v * 8);
  const holoPosX = useTransform(combinedY, (v) => 50 + v * 2);
  const holoPosY = useTransform(combinedX, (v) => 50 - v * 2);
  const holoIntensity = useTransform(
    [combinedX, combinedY] as MotionValue[],
    ([rx, ry]: number[]) => Math.min(0.12, 0.03 + (Math.abs(rx) + Math.abs(ry)) * 0.004)
  );

  const quote = useMemo(() => getCardQuote(card, language), [card, language]);

  return (
    <div
      style={{ perspective: 800 }}
      className="flex items-center justify-center select-none"
    >
      <motion.div
        {...handlers}
        style={{
          transformStyle: "preserve-3d" as const,
          rotateX: reducedMotion ? 0 : combinedX,
          rotateY: reducedMotion ? 0 : combinedY,
          willChange: "transform",
          touchAction: "none",
        }}
        className="relative w-[min(250px,62vw)] h-[min(350px,87vw)] cursor-grab active:cursor-grabbing"
      >
        {/* 카드 배경 */}
        <div
          className="absolute inset-0 rounded-xl bg-bg-elevated overflow-hidden"
          style={{ boxShadow: glow || "0 4px 24px rgba(0,0,0,0.6)" }}
        >
          {/* Rarity 텍스처 */}
          <RarityTexture rarity={card.rarity} borderRadius={12} />

          {/* 홀로그래픽 오버레이 (normal 제외) */}
          {card.rarity !== "normal" && !reducedMotion && (
            <HolographicOverlay
              angle={holoAngle}
              posX={holoPosX}
              posY={holoPosY}
              intensity={holoIntensity}
              color={rarity.color}
            />
          )}

          {/* 카드 콘텐츠 */}
          <div className="relative z-10 flex flex-col h-full p-5">
            {/* 상단: 아이콘 + 레어리티 */}
            <div className="flex items-start justify-between mb-4">
              <div style={{ color: rarity.color }}>
                <PixelIcon name={card.icon} size={48} />
              </div>
              <div
                className="typo-micro px-2 py-0.5 rounded-sm"
                style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
              >
                {rarityLabel(card.rarity, language)}
              </div>
            </div>

            {/* 제목 */}
            <h2 className="typo-body text-text-primary leading-tight mb-1.5">
              {cardTitle(card, language)}
            </h2>

            {/* 설명 */}
            <p className="typo-caption text-text-secondary leading-relaxed mb-3 flex-shrink-0">
              {cardDesc(card, language)}
            </p>

            {/* 카테고리 + 완료 횟수 */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1 text-text-tertiary">
                <PixelIcon name={categoryIcon} size={14} />
                <span className="typo-micro">{categoryLabel(card.category, language)}</span>
              </div>
              <span className="typo-micro text-text-tertiary">·</span>
              <span className="typo-micro text-text-tertiary">
                {completions > 0
                  ? t("cardDetail.completions", { count: completions })
                  : t("cardDetail.noCompletions")}
              </span>
            </div>

            {/* 구분선 */}
            <div
              className="h-px w-full mb-3 opacity-20"
              style={{ backgroundColor: rarity.color }}
            />

            {/* 명언/유머 */}
            <p className="typo-caption text-text-secondary leading-relaxed flex-1 flex items-center opacity-70">
              &ldquo;{quote}&rdquo;
            </p>

            {/* 자이로 권한 요청 버튼 (iOS 13+ 미허용 시에만 표시) */}
            {gyro.needsPermission && !reducedMotion && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const ok = await gyro.requestPermission();
                  if (ok) play("confirm");
                }}
                className="mt-2 typo-micro text-text-tertiary bg-bg-surface/50 rounded-md px-3 py-1.5 text-center"
              >
                {t("cardDetail.enableGyro")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── 홀로그래픽 오버레이 (별도 컴포넌트로 분리 — 훅 규칙 준수) ── */
function HolographicOverlay({
  angle,
  posX,
  posY,
  intensity,
  color,
}: {
  angle: MotionValue<number>;
  posX: MotionValue<number>;
  posY: MotionValue<number>;
  intensity: MotionValue<number>;
  color: string;
}) {
  // useTransform 을 컴포넌트 최상위에서 호출
  const background = useTransform(
    [angle, posX, posY] as MotionValue[],
    ([a, px, py]: number[]) =>
      `conic-gradient(from ${a}deg at ${px}% ${py}%, ${color}18 0deg, transparent 60deg, ${color}18 120deg, transparent 180deg, ${color}18 240deg, transparent 300deg, ${color}18 360deg)`
  );

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none rounded-xl"
      style={{
        background,
        opacity: intensity,
        mixBlendMode: "screen" as const,
      }}
    />
  );
}
