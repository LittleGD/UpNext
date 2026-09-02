"use client";

/**
 * Up Hero — 이벤트 결과 팝업의 분위기 레이어.
 *
 * 규약 (유저 요구): "읽는 데 지장을 주지 않는 모션".
 *   → 본문 텍스트는 진입 후 완전히 정지. 움직이는 것은 전부 이 컴포넌트가
 *     그리는 주변부 (배경 워시 · 입자 · 잭팟 링 펄스 · 비네트) 뿐이다.
 *     이 레이어는 카드 뒤에 깔리고 pointer-events 를 먹지 않는다.
 *
 * 톤별 연출:
 *   jackpot — 황금 스파크가 빠르게 솟고, 중앙에서 사각 링이 두 번 퍼진다.
 *   boon    — 라임 모트가 느리게 위로 흐른다.
 *   neutral — 아주 희미한 먼지. 있는 듯 없는 듯.
 *   bane    — 붉은 재가 위에서 떨어지고 화면 가장자리가 눌린다.
 *
 * reduced-motion: 입자·펄스 전부 제거, 톤 색 워시만 정적으로 남긴다.
 *   (색은 정보라서 지우지 않는다. 움직임만 지운다.)
 *
 * 입자 좌표/딜레이는 하드코딩 테이블 — Math.random 을 쓰면 SSR/CSR 사이
 *   hydration mismatch 가 나고, 매 렌더마다 배치가 바뀌어 재생 중 튄다.
 */

import { GB } from "@/lib/upHeroPalette";
import { CHOICE_TONE_COLOR, type ChoiceResultTone } from "./choiceResultTypes";

interface AuraParticle {
  /** 가로 위치 (%) */
  x: number;
  /** 한 변 (px) — 픽셀아트 결을 위해 정사각, radius 0 */
  s: number;
  /** 시작 지연 (ms) */
  delay: number;
  /** 1 사이클 (ms) */
  dur: number;
  /** 가로 표류 (px) */
  drift: number;
  /**
   * 세로 이동 거리 (px). % 를 쓰면 translate 의 % 기준이 컨테이너가 아니라
   * 입자 자신(2~4px)이 되어 사실상 움직이지 않는다 — 반드시 px.
   */
  travel: number;
}

const PARTICLES: readonly AuraParticle[] = [
  { x: 6, s: 3, delay: 0, dur: 2400, drift: 10, travel: 248 },
  { x: 14, s: 2, delay: 320, dur: 3000, drift: -8, travel: 296 },
  { x: 21, s: 4, delay: 700, dur: 2200, drift: 6, travel: 220 },
  { x: 29, s: 2, delay: 140, dur: 2800, drift: 12, travel: 320 },
  { x: 36, s: 3, delay: 980, dur: 2600, drift: -6, travel: 264 },
  { x: 44, s: 2, delay: 460, dur: 3200, drift: 9, travel: 352 },
  { x: 51, s: 4, delay: 180, dur: 2500, drift: -11, travel: 232 },
  { x: 58, s: 2, delay: 860, dur: 2900, drift: 7, travel: 312 },
  { x: 65, s: 3, delay: 300, dur: 2300, drift: -9, travel: 240 },
  { x: 72, s: 2, delay: 1120, dur: 3100, drift: 5, travel: 336 },
  { x: 79, s: 4, delay: 620, dur: 2700, drift: -7, travel: 280 },
  { x: 86, s: 2, delay: 240, dur: 2450, drift: 11, travel: 256 },
  { x: 92, s: 3, delay: 1040, dur: 2950, drift: -5, travel: 304 },
  { x: 97, s: 2, delay: 540, dur: 2650, drift: 8, travel: 272 },
];

/** 톤별 입자 성격 — 개수·속도·최대 불투명도. */
const TONE_PARTICLES: Record<
  ChoiceResultTone,
  { count: number; speed: number; peak: number; falling: boolean }
> = {
  jackpot: { count: 14, speed: 0.7, peak: 0.95, falling: false },
  boon: { count: 10, speed: 1, peak: 0.75, falling: false },
  neutral: { count: 5, speed: 1.5, peak: 0.3, falling: false },
  bane: { count: 11, speed: 1.15, peak: 0.7, falling: true },
};

/** big 티어 스파크 — 위에서 떨어지는 픽셀 정사각. 상승 입자와 방향이 반대라 "쏟아진다". */
const SPARKS: readonly { x: number; delay: number; s: number; drift: number }[] = [
  { x: 8, delay: 0, s: 3, drift: 6 },
  { x: 17, delay: 90, s: 2, drift: -5 },
  { x: 26, delay: 40, s: 4, drift: 8 },
  { x: 35, delay: 160, s: 2, drift: -7 },
  { x: 44, delay: 20, s: 3, drift: 4 },
  { x: 52, delay: 120, s: 2, drift: -4 },
  { x: 60, delay: 70, s: 4, drift: 7 },
  { x: 68, delay: 200, s: 3, drift: -6 },
  { x: 76, delay: 30, s: 2, drift: 5 },
  { x: 84, delay: 140, s: 3, drift: -8 },
  { x: 91, delay: 60, s: 2, drift: 6 },
  { x: 97, delay: 180, s: 3, drift: -5 },
];

interface ChoiceResultAuraProps {
  tone: ChoiceResultTone;
  /** true 면 모션 전부 제거, 톤 워시만 정적으로 */
  reducedMotion: boolean;
  /**
   * big 티어 버스트 — 링 하나 더 + 스파크 낙하. 호출자가 reduced-motion 을 이미
   * 접어서 넘긴다 (여기서는 reducedMotion 이면 어차피 그리지 않는다).
   */
  burst?: boolean;
}

export default function ChoiceResultAura({
  tone,
  reducedMotion,
  burst = false,
}: ChoiceResultAuraProps) {
  const color = CHOICE_TONE_COLOR[tone];
  const cfg = TONE_PARTICLES[tone];
  // 워시는 아래에서 올라오는 톤(상승 입자)과 위에서 내려오는 톤(하강 입자)의
  // 무게중심을 맞춘다 — 입자가 나오는 쪽이 밝아야 자연스럽다.
  const washY = cfg.falling ? "18%" : "82%";

  return (
    <div
      className="choice-aura absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={
        {
          "--aura-color": color,
          // color-mix() 는 구형 WKWebView 에서 빠져 워시가 통째로 사라진다.
          // 8자리 hex 로 알파를 미리 붙여 넘긴다.
          "--aura-wash": `${color}42`,
          "--aura-wash-y": washY,
        } as React.CSSProperties
      }
    >
      {/* 톤 워시 — 결과 색이 배경에 번진다. reduced-motion 이면 정적. */}
      <div className={`aura-wash ${reducedMotion ? "" : "aura-wash-breathe"}`} />

      {/* bane 전용 비네트 — 가장자리가 눌리며 "좁혀지는" 압박감. */}
      {tone === "bane" && (
        <div className={`aura-vignette ${reducedMotion ? "" : "aura-vignette-in"}`} />
      )}

      {!reducedMotion && (
        <>
          {/* jackpot 전용 링 펄스 — 중앙에서 사각형이 두 번 퍼진다. */}
          {tone === "jackpot" && (
            <>
              <span className="aura-ring" />
              <span className="aura-ring aura-ring-2" />
              {burst && <span className="aura-ring aura-ring-3" />}
            </>
          )}

          {/* big 버스트 — 스파크가 위에서 쏟아진다. 한 번만 (infinite 아님). */}
          {burst &&
            SPARKS.map((p, i) => (
              <span
                key={`spark-${i}`}
                className="aura-spark"
                style={
                  {
                    "--x": `${p.x}%`,
                    "--s": `${p.s}px`,
                    "--delay": `${p.delay}ms`,
                    "--drift": `${p.drift}px`,
                  } as React.CSSProperties
                }
              />
            ))}

          {PARTICLES.slice(0, cfg.count).map((p, i) => (
            <span
              key={i}
              className={`aura-dot ${cfg.falling ? "aura-fall" : "aura-rise"}`}
              style={
                {
                  "--x": `${p.x}%`,
                  "--s": `${p.s}px`,
                  "--delay": `${p.delay}ms`,
                  "--dur": `${Math.round(p.dur * cfg.speed)}ms`,
                  "--drift": `${p.drift}px`,
                  "--travel": `${p.travel}px`,
                  "--peak": cfg.peak,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      <style jsx>{`
        .aura-wash {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at 50% var(--aura-wash-y),
            var(--aura-wash) 0%,
            transparent 62%
          );
          opacity: 0.9;
        }
        .aura-wash-breathe {
          animation: aura-breathe 2600ms ease-in-out infinite;
        }
        .aura-vignette {
          position: absolute;
          inset: 0;
          box-shadow: inset 0 0 90px 24px ${GB.darkest};
          opacity: 0.85;
        }
        .aura-vignette-in {
          animation: aura-vignette-press 900ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        .aura-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 40px;
          height: 40px;
          margin: -20px 0 0 -20px;
          box-shadow: 0 0 0 2px var(--aura-color);
          opacity: 0;
          animation: aura-ring-out 900ms cubic-bezier(0.23, 1, 0.32, 1) 120ms both;
        }
        .aura-ring-2 {
          animation-delay: 420ms;
        }
        .aura-ring-3 {
          animation-delay: 720ms;
        }
        .aura-spark {
          position: absolute;
          top: -6px;
          left: var(--x);
          width: var(--s);
          height: var(--s);
          background: var(--aura-color);
          opacity: 0;
          animation: aura-spark-fall 900ms cubic-bezier(0.3, 0, 0.7, 1) var(--delay) both;
        }
        @keyframes aura-spark-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
          12% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drift), 320px, 0);
          }
        }
        .aura-dot {
          position: absolute;
          left: var(--x);
          width: var(--s);
          height: var(--s);
          background: var(--aura-color);
          opacity: 0;
          will-change: transform, opacity;
        }
        .aura-rise {
          bottom: -8px;
          animation: aura-rise var(--dur) linear var(--delay) infinite;
        }
        .aura-fall {
          top: -8px;
          animation: aura-fall var(--dur) linear var(--delay) infinite;
        }
        @keyframes aura-rise {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
          14% {
            opacity: var(--peak);
          }
          78% {
            opacity: var(--peak);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drift), calc(-1 * var(--travel)), 0);
          }
        }
        @keyframes aura-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
          14% {
            opacity: var(--peak);
          }
          78% {
            opacity: var(--peak);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drift), var(--travel), 0);
          }
        }
        @keyframes aura-breathe {
          0%,
          100% {
            opacity: 0.62;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes aura-vignette-press {
          from {
            opacity: 0;
          }
          to {
            opacity: 0.85;
          }
        }
        @keyframes aura-ring-out {
          0% {
            opacity: 0.9;
            transform: scale(0.4);
          }
          100% {
            opacity: 0;
            transform: scale(6);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .aura-wash-breathe,
          .aura-vignette-in,
          .aura-ring,
          .aura-dot,
          .aura-spark {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
