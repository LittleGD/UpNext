"use client";

/**
 * Up Hero — Phase 11a: 장비 강화 연출 (2초).
 *
 * Phase 5-B — `band` 로 연출이 단계별로 커진다 (목표 레벨 기준, enhanceRitualBand):
 *   band 0 (+1..+10): 2000ms / 6 spark (아래 기존 설명 그대로)
 *   band 1 (+11..+15): 2600ms / 10 spark / 성공 시 마지막 20% 루트 shake 260ms
 *   band 2 (+16..+20): 3400ms / 14 spark / shake 420ms (enhance-shake-strong, 6px)
 *                      / 소실 시 spark 분산 ×4 + 두 번째 링
 *   reduced-motion: 60ms 후 onDone, shake·spark 없음 (기존 패턴).
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
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";
import RarityTexture from "@/components/cards/RarityTexture";
import type { Equipment } from "@/types/uphero";

export type EnhanceRitualOutcome = "success" | "keep" | "destroyed";

/** Phase 5-B — 밴드별 연출 길이 / spark 수 / shake 길이. iOS 와 같은 값. */
const RITUAL_DURATION_MS: readonly [number, number, number] = [2000, 2600, 3400];
const RITUAL_SPARKS: readonly [number, number, number] = [6, 10, 14];
const RITUAL_SHAKE_MS: readonly [number, number, number] = [0, 260, 420];

interface EnhanceRitualOverlayProps {
  /** 애니메이션 대상 아이템 (결과 전 상태). */
  item: Equipment;
  /** 결과 outcome — 연출의 마지막 flash color 결정. */
  outcome: EnhanceRitualOutcome;
  /**
   * Phase 5-B — 연출 밴드 (enhanceRitualBand(targetLevel)). 필수 prop 이라 호출부가
   * 밴드를 빠뜨리면 TS 가 잡는다.
   */
  band: 0 | 1 | 2;
  /** duration 후 (또는 reduced-motion 이면 60ms) 호출. */
  onDone: () => void;
}

export default function EnhanceRitualOverlay({
  item,
  outcome,
  band,
  onDone,
}: EnhanceRitualOverlayProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const durationMs = RITUAL_DURATION_MS[band];
  const sparkCount = RITUAL_SPARKS[band];
  const shakeMs = RITUAL_SHAKE_MS[band];

  useEffect(() => {
    if (reducedMotion) {
      // 즉시 결과 모달로
      const id = window.setTimeout(onDone, 60);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(id);
  }, [onDone, reducedMotion, durationMs]);

  if (typeof window === "undefined") return null;

  const flashColor =
    outcome === "success"
      ? GB.lightest
      : outcome === "keep"
        ? GB_WARN
        : GB_ENEMY;

  // spark — 밴드별 6/10/14 개를 원주에 균등 배치.
  // 각 spark 는 60px 거리에서 시작해 중앙으로 수렴 (inner) 후 outcome 에 따라 분기.
  const sparks = Array.from({ length: sparkCount }, (_, i) => {
    const angle = (i / sparkCount) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * 60);
    const y = Math.round(Math.sin(angle) * 60);
    return { id: i, x, y, angle };
  });
  // Phase 5-B — band 2 소실은 두 번째 spark 링 (120ms 지연, 반대 위상) 을 더 뿌린다.
  const secondRing =
    band >= 1 && outcome === "destroyed"
      ? sparks.map((s) => ({ ...s, id: s.id + sparkCount, x: -s.x, y: -s.y }))
      : [];
  // 성공 시 마지막 20% 에 루트가 흔들린다. animation-delay 로 시점을 맞춘다.
  const shakeClass =
    !reducedMotion && outcome === "success" && band >= 1 ? `shake-${band}` : "";
  const shakeDelayMs = Math.max(0, durationMs - shakeMs);

  return createPortal(
    <div
      aria-hidden="true"
      className={`enhance-overlay-root fixed inset-0 z-[65] flex items-center justify-center ${shakeClass}`}
      style={
        {
          background: `${GB.darkest}e6`,
          "--enh-ms": `${durationMs}ms`,
          "--enh-shake-ms": `${shakeMs}ms`,
          "--enh-shake-delay": `${shakeDelayMs}ms`,
          "--enh-scatter": band >= 1 ? 4 : 3,
        } as React.CSSProperties
      }
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
          {t("uphero.enhance.inProgress")}
        </div>
      </div>

      {/* spark — 중앙 기준 absolute */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[...sparks, ...secondRing].map((s) => (
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
                animationDelay: `${(s.id % sparkCount) * 80 + (s.id >= sparkCount ? 120 : 0)}ms`,
                "--sx": `${s.x}px`,
                "--sy": `${s.y}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <style jsx>{`
        .enhance-overlay-glow {
          animation: enhance-glow var(--enh-ms) ${EASE_OUT} both;
        }
        .enhance-overlay-item {
          animation: enhance-item var(--enh-ms) ${EASE_OUT} both;
        }
        .enhance-overlay-item.outcome-destroyed {
          animation: enhance-item-destroyed var(--enh-ms) ${EASE_OUT} both;
        }
        .enhance-overlay-spark {
          animation: enhance-spark var(--enh-ms) ${EASE_OUT} both;
        }
        .enhance-overlay-spark.outcome-destroyed {
          animation: enhance-spark-destroyed var(--enh-ms) ${EASE_OUT} both;
        }
        /* Phase 5-B — 성공 시 마지막 구간 루트 shake. band 1 은 치명타 shake 재사용,
           band 2 는 globals.css 의 enhance-shake-strong (6px). */
        .enhance-overlay-root.shake-1 {
          animation: uphero-crit-shake var(--enh-shake-ms) steps(5, end)
            var(--enh-shake-delay) both;
        }
        .enhance-overlay-root.shake-2 {
          animation: enhance-shake-strong var(--enh-shake-ms) steps(7, end)
            var(--enh-shake-delay) both;
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
            transform: translate(
                calc(var(--sx) * var(--enh-scatter)),
                calc(var(--sy) * var(--enh-scatter))
              )
              scale(0) rotate(720deg);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .enhance-overlay-glow,
          .enhance-overlay-item,
          .enhance-overlay-spark,
          .enhance-overlay-root.shake-1,
          .enhance-overlay-root.shake-2 {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
