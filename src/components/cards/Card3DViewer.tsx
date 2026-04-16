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
    // 상세 모달: TCG 5:7 비율 + 축소된 밀도 (380/420/460)
    w: "w-[min(272px,72vw,calc(78vh*5/7))] md:w-[min(300px,calc(82vh*5/7))] lg:w-[min(328px,calc(82vh*5/7))]",
    h: "h-[min(380px,100vw,78vh)] md:h-[min(420px,82vh)] lg:h-[min(460px,82vh)]",
    padding: "p-5 md:p-6 lg:p-7",
    iconMobile: 48,
    iconMd: 56,
    iconLg: 64,
  },
};

// ── 콘텐츠 Zone stagger — 모달 진입 시 3 구역 순차 등장 (총 ~560ms)
// delayChildren 0.08 + staggerChildren 0.08 × 2 + duration 0.32
// Exit 는 부모 모달의 AnimatePresence 가 처리 (비대칭: enter 560 / exit 200)
const contentStaggerVariants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.08,
    },
  },
};

const zoneVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: "easeOut" as const },
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
  // ── 내부 parallax z-depth — detail 에서 더 두드러지게, preview 는 절제
  // 둘 다 양수 — preserve-3d 에서 음수 Z 가 불투명 배경(Z=0)에 가려지는 것 방지.
  // 차이값이 parallax 강도: detail 에서 16px, preview 에서 10px 간격.
  const titleZ = variant === "detail" ? 20 : 12;
  const quoteZ = variant === "detail" ? 4 : 2;

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
        {/* 카드 배경 — 텍스처 + 홀로 레이어 (overflow-hidden 으로 rarity 클립) */}
        <div
          className="absolute inset-0 rounded-xl bg-bg-elevated overflow-hidden"
          style={{ boxShadow: glow || "0 4px 24px rgba(0,0,0,0.6)" }}
        >
          <RarityTexture rarity={card.rarity} borderRadius={12} />

          {card.rarity !== "normal" && !reducedMotion && (
            <HolographicOverlay
              angle={holoAngle}
              posX={holoPosX}
              posY={holoPosY}
              intensity={holoIntensity}
              color={rarity.color}
            />
          )}
        </div>

        {/* 카드 콘텐츠 레이어 — preserve-3d 로 내부 parallax (title/quote 에 미세 z-transform)
            배경 div 의 overflow-hidden 밖으로 분리 → 3D 변환 보존. 콘텐츠는 padding 덕분에
            카드 가장자리에 닿지 않아 둥근 모서리 클립이 필요 없음. */}
        <motion.div
          className={`absolute inset-0 z-10 flex flex-col ${box.padding}`}
          style={{ transformStyle: "preserve-3d" as const }}
          variants={reducedMotion ? undefined : contentStaggerVariants}
          initial={reducedMotion ? undefined : "hidden"}
          animate={reducedMotion ? undefined : "visible"}
        >
          {/* Zone 1 — Header: 아이콘 + 레어리티 pill (2행 구조) */}
          <motion.div
            variants={reducedMotion ? undefined : zoneVariants}
            className="flex items-start justify-between"
          >
            <div style={{ color: rarity.color }}>
              <PixelIcon name={card.icon} size={iconSize} />
            </div>
            <div
              className="typo-micro px-2 py-0.5 rounded-sm"
              style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
            >
              {rarityLabel(card.rarity, language)}
            </div>
          </motion.div>

          {/* Zone 2 — Body: title (Hero) + meta subline + description
              24px 그룹 간격으로 분리, z+titleZ 만큼 전방 parallax */}
          <motion.div
            variants={reducedMotion ? undefined : zoneVariants}
            className="mt-6"
            style={reducedMotion ? undefined : { z: titleZ }}
          >
            <h2 className={`${titleClass} text-text-primary leading-tight font-semibold`}>
              {cardTitle(card, language)}
            </h2>
            {/* 메타 subline — 제목 바로 아래, 8px 간격 */}
            <div className="flex items-center gap-2 mt-2 text-text-tertiary">
              <div className="flex items-center gap-1">
                <PixelIcon name={categoryIcon} size={14} />
                <span className={metaClass}>{categoryLabel(card.category, language)}</span>
              </div>
              <span className={metaClass}>·</span>
              <span className={metaClass}>
                {completions > 0
                  ? t("cardDetail.completions", { count: completions })
                  : t("cardDetail.noCompletions")}
              </span>
            </div>
            {/* 설명 — 메타 아래 8px, body 톤 */}
            <p className={`${bodyClass} text-text-secondary leading-relaxed mt-2`}>
              {cardDesc(card, language)}
            </p>
          </motion.div>

          {/* Zone 3 — Footer: 인용문은 하단 앵커 + caption + italic + opacity 60 으로 강등
              divider 를 제거하고 mt-auto 공백 + 시각적 감쇠로 title 과 위계 분리
              z-quoteZ 만큼 후방 parallax → 드래그 시 title 과 엇갈려 깊이감 */}
          <motion.p
            variants={reducedMotion ? undefined : zoneVariants}
            className="typo-caption text-text-secondary leading-relaxed mt-auto opacity-60"
            style={
              reducedMotion
                ? { fontStyle: "italic" }
                : { fontStyle: "italic", z: quoteZ }
            }
          >
            &ldquo;{quote}&rdquo;
          </motion.p>

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
        </motion.div>
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
