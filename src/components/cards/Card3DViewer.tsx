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
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSound } from "@/hooks/useSound";
import RarityTexture, { rarityGlow } from "./RarityTexture";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Card3DViewer 의 세 컨텍스트:
 *  - "detail"  : 컬렉션 상세 모달 (가장 큼) — 뷰어가 유일한 콘텐츠
 *  - "preview" : 덱에서 카드 탭 시 중앙 프리뷰 (중간) — 뒤에 덱이 흐리게 보임
 *  - (Final 확정 카드는 다른 셀 렌더러를 씀 — Card3DViewer 는 3D 드래그용)
 *
 * 크기 전략:
 *  - preview : min(220px, 58vw, 68vh)
 *  - detail  : min(300px, 72vw, 78vh)   — 모바일에서 뷰포트 높이도 고려
 *  - 둘 다 TCG 비율 2.5 : 3.5 유지
 */
type Variant = "detail" | "preview";

interface Card3DViewerProps {
  card: ChallengeCard;
  language: Language;
  variant?: Variant;
}

/** 뷰포트 높이까지 고려한 반응형 카드 박스 */
const CARD_BOX: Record<Variant, { w: string; h: string; padding: string; iconMobile: number; iconMd: number; iconLg: number }> = {
  preview: {
    // 58vw 를 기준으로 하되, 짧은 화면에서는 48vh * (5/7) 비율로 제한
    w: "w-[min(220px,58vw,calc(68vh*5/7))] md:w-[min(260px,calc(72vh*5/7))] lg:w-[min(300px,calc(72vh*5/7))]",
    h: "h-[min(308px,81vw,68vh)] md:h-[min(364px,72vh)] lg:h-[min(420px,72vh)]",
    padding: "p-4 md:p-5 lg:p-6",
    iconMobile: 40,
    iconMd: 48,
    iconLg: 56,
  },
  detail: {
    // 상세 모달: 더 넓게, 높이는 78vh 까지 허용
    w: "w-[min(300px,72vw,calc(78vh*5/7))] md:w-[min(340px,calc(82vh*5/7))] lg:w-[min(380px,calc(82vh*5/7))]",
    h: "h-[min(420px,100vw,78vh)] md:h-[min(476px,82vh)] lg:h-[min(532px,82vh)]",
    padding: "p-5 md:p-6 lg:p-7",
    iconMobile: 48,
    iconMd: 56,
    iconLg: 64,
  },
};

export default function Card3DViewer({ card, language, variant = "detail" }: Card3DViewerProps) {
  const { play } = useSound();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLg = useMediaQuery("(min-width: 1024px)");
  const rarity = RARITY_CONFIG[card.rarity];
  const glow = rarityGlow(card.rarity);
  const categoryIcon = CATEGORY_ICONS[card.category] || "Sparkle";
  const completions = useGameStore((s) => s.progress.cardCompletions?.[card.id] || 0);
  const box = CARD_BOX[variant];
  const iconSize = isLg ? box.iconLg : isMd ? box.iconMd : box.iconMobile;

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
  const combinedX = useMotionValue(0);
  const combinedY = useMotionValue(0);

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

  // variant 별 타이틀 / 바디 / 메타 사이즈 토큰
  const titleClass = variant === "detail" ? "typo-heading" : "typo-body";
  const bodyClass = variant === "detail" ? "typo-body" : "typo-caption";
  const metaClass = "typo-micro";

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
        className={`relative ${box.w} ${box.h} cursor-grab active:cursor-grabbing`}
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
          <div className={`relative z-10 flex flex-col h-full ${box.padding}`}>
            {/* 상단: 아이콘 + 레어리티 */}
            <div className="flex items-start justify-between mb-4 md:mb-5">
              <div style={{ color: rarity.color }}>
                <PixelIcon name={card.icon} size={iconSize} />
              </div>
              <div
                className="typo-micro px-2 py-0.5 rounded-sm"
                style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
              >
                {rarityLabel(card.rarity, language)}
              </div>
            </div>

            {/* 제목 — variant 에 따라 heading/body 로 토큰 분기 */}
            <h2 className={`${titleClass} text-text-primary leading-tight mb-2 font-semibold`}>
              {cardTitle(card, language)}
            </h2>

            {/* 설명 — body (caption 이 여러 곳에서 쓰이던 과부하 해소) */}
            <p className={`${bodyClass} text-text-secondary leading-relaxed mb-3 flex-shrink-0`}>
              {cardDesc(card, language)}
            </p>

            {/* 카테고리 + 완료 횟수 — 메타 라인은 항상 micro */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1 text-text-tertiary">
                <PixelIcon name={categoryIcon} size={14} />
                <span className={metaClass}>{categoryLabel(card.category, language)}</span>
              </div>
              <span className={`${metaClass} text-text-tertiary`}>·</span>
              <span className={`${metaClass} text-text-tertiary`}>
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

            {/* 명언/유머 — italic + 낮은 opacity 로 바디 텍스트와 시각적 구분 */}
            <p
              className={`${bodyClass} text-text-secondary leading-relaxed flex-1 flex items-center opacity-70`}
              style={{ fontStyle: "italic" }}
            >
              &ldquo;{quote}&rdquo;
            </p>

            {/* 자이로 권한 요청 버튼 (iOS 13+ 미허용 시에만 표시) */}
            {gyro.needsPermission && !reducedMotion && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={async (e) => {
                  e.stopPropagation();
                  const ok = await gyro.requestPermission();
                  if (ok) play("confirm");
                }}
                className="mt-2 typo-micro text-text-tertiary bg-bg-surface/50 rounded-md px-3 min-h-[44px] flex items-center justify-center text-center"
              >
                {t("cardDetail.enableGyro")}
              </motion.button>
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
