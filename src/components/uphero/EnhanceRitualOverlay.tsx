"use client";

/**
 * Up Hero — Phase 11a: 장비 강화 연출 (2초).
 *
 * 흐름:
 *   0–600ms   : 아이템 scale(1→1.1) + glow pulse. 6 spark 외곽 → 중심 수렴.
 *   600–1600ms: spark 회전 가속, rarity color 톤 intensify.
 *   1600–2000ms: 결과별 최종 플래시:
 *                - success  : GB.lightest (녹) 폭발
 *                - keep     : GB_WARN (황) 미묘 shake + 재수렴
 *                - destroyed: GB_ENEMY (적) spark 분산 + 아이콘 crumble
 *
 * 2000ms 후 onDone 콜백 → 부모가 EnhanceResultModal 표시.
 *
 * 사용:
 *   parent 가 enhanceItem() 호출 직후 결과를 확보하고, 이 overlay 를 먼저 띄운다.
 *   2초 뒤 onDone 에서 결과 모달로 전환.
 *
 * reduced-motion 유저: 즉시 onDone 호출 (0ms). 시각적 혼란 방지.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT, GB_ENEMY, GB_WARN } from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import PixelIcon from "@/components/icons/PixelIcon";
import RarityTexture from "@/components/cards/RarityTexture";
import type { Equipment } from "@/types/uphero";

export type EnhanceRitualOutcome = "success" | "keep" | "destroyed";

interface EnhanceRitualOverlayProps {
  /** 애니메이션 대상 아이템 (결과 전 상태). */
  item: Equipment;
  /** 결과 outcome — 연출의 마지막 flash color 결정. */
  outcome: EnhanceRitualOutcome;
  /** 2000ms 후 (또는 reduced-motion 이면 즉시) 호출. */
  onDone: () => void;
}

export default function EnhanceRitualOverlay({
  item,
  outcome,
  onDone,
}: EnhanceRitualOverlayProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // 즉시 결과 모달로
      const id = window.setTimeout(onDone, 60);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(onDone, 2000);
    return () => window.clearTimeout(id);
  }, [onDone, reducedMotion]);

  if (typeof window === "undefined") return null;

  const flashColor =
    outcome === "success"
      ? GB.lightest
      : outcome === "keep"
        ? GB_WARN
        : GB_ENEMY;

  // 6개 spark — 0°, 60°, 120°, 180°, 240°, 300°.
  // 각 spark 는 60px 거리에서 시작해 중앙으로 수렴 (inner) 후 outcome 에 따라 분기.
  const sparks = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * 60);
    const y = Math.round(Math.sin(angle) * 60);
    return { id: i, x, y, angle };
  });

  return createPortal(
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[65] flex items-center justify-center"
      style={{ background: `${GB.darkest}e6` }}
    >
      {/* Ambient glow — outcome 색 기반 라디얼 */}
      <div
        className={`enhance-overlay-glow absolute inset-0 pointer-events-none outcome-${outcome}`}
        style={{
          background: `radial-gradient(circle at center, ${flashColor}55 0%, ${flashColor}11 30%, transparent 60%)`,
        }}
      />

      {/* Item 본체 */}
      <div
        className={`enhance-overlay-item relative outcome-${outcome}`}
        style={{
          width: 120,
          height: 160,
          background: `${GB.dark}dd`,
          border: `1px solid ${flashColor}`,
          borderRadius: 6,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <RarityTexture rarity={item.rarity} borderRadius={6} />
        <PixelIcon name={item.iconName} size={42} color={flashColor} />
        <div
          className="typo-caption text-center"
          style={{ color: GB.lightest }}
        >
          강화 중
        </div>
      </div>

      {/* 6개 spark — 중앙 기준 absolute */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {sparks.map((s) => (
          <span
            key={s.id}
            className={`enhance-overlay-spark outcome-${outcome}`}
            // CSS var 로 spark 별 target 좌표 전달 — keyframe 이 이 값을 참조.
            style={
              {
                position: "absolute",
                width: 4,
                height: 4,
                background: flashColor,
                borderRadius: "50%",
                boxShadow: `0 0 6px ${flashColor}`,
                animationDelay: `${s.id * 80}ms`,
                "--sx": `${s.x}px`,
                "--sy": `${s.y}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <style jsx>{`
        .enhance-overlay-glow {
          animation: enhance-glow 2000ms ${EASE_OUT} both;
        }
        .enhance-overlay-item {
          animation: enhance-item 2000ms ${EASE_OUT} both;
        }
        .enhance-overlay-item.outcome-destroyed {
          animation: enhance-item-destroyed 2000ms ${EASE_OUT} both;
        }
        .enhance-overlay-spark {
          animation: enhance-spark 2000ms ${EASE_OUT} both;
        }
        .enhance-overlay-spark.outcome-destroyed {
          animation: enhance-spark-destroyed 2000ms ${EASE_OUT} both;
        }

        @keyframes enhance-glow {
          0%   { opacity: 0; }
          30%  { opacity: 0.5; }
          75%  { opacity: 0.7; }
          85%  { opacity: 1; }
          100% { opacity: 0.4; }
        }
        @keyframes enhance-item {
          0%   { transform: scale(1); filter: brightness(1); }
          30%  { transform: scale(1.08); filter: brightness(1.1); }
          75%  { transform: scale(1.1); filter: brightness(1.25); }
          85%  { transform: scale(1.15); filter: brightness(1.5); }
          100% { transform: scale(1.08); filter: brightness(1.2); }
        }
        @keyframes enhance-item-destroyed {
          0%   { transform: scale(1); filter: brightness(1); }
          30%  { transform: scale(1.08); filter: brightness(1.1); }
          75%  { transform: scale(1.1) translateX(0); filter: brightness(1.25); }
          80%  { transform: scale(1.1) translateX(-4px); filter: brightness(0.9); }
          85%  { transform: scale(1.1) translateX(4px); filter: brightness(0.6); }
          95%  { transform: scale(0.9); opacity: 0.3; filter: saturate(0); }
          100% { transform: scale(0.8); opacity: 0; filter: saturate(0); }
        }
        @keyframes enhance-spark {
          0% {
            transform: translate(var(--sx), var(--sy)) scale(0.4);
            opacity: 0;
          }
          30% {
            transform: translate(calc(var(--sx) * 0.5), calc(var(--sy) * 0.5))
              scale(1);
            opacity: 1;
          }
          70% {
            transform: translate(0, 0) scale(1.2) rotate(360deg);
            opacity: 1;
          }
          85% {
            transform: translate(0, 0) scale(1.5) rotate(540deg);
            opacity: 1;
          }
          100% {
            transform: translate(calc(var(--sx) * 0.3), calc(var(--sy) * 0.3))
              scale(0.4) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes enhance-spark-destroyed {
          0% {
            transform: translate(var(--sx), var(--sy)) scale(0.4);
            opacity: 0;
          }
          30% {
            transform: translate(calc(var(--sx) * 0.5), calc(var(--sy) * 0.5))
              scale(1);
            opacity: 1;
          }
          70% {
            transform: translate(0, 0) scale(1.2) rotate(360deg);
            opacity: 1;
          }
          85% {
            transform: translate(calc(var(--sx) * 1.8), calc(var(--sy) * 1.8))
              scale(0.8) rotate(540deg);
            opacity: 0.6;
          }
          100% {
            transform: translate(calc(var(--sx) * 3), calc(var(--sy) * 3))
              scale(0) rotate(720deg);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .enhance-overlay-glow,
          .enhance-overlay-item,
          .enhance-overlay-spark {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
