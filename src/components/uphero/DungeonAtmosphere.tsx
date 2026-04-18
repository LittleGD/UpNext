"use client";

/**
 * Up Hero — Phase 10: 던전별 ambient atmosphere layer.
 *
 * 그래픽 일러스트 없이 "세계관" 을 전달하는 얇은 CSS 연출:
 *  - fitness (강철 산봉우리) — 눈 내림
 *  - learning (메아리 도서관) — 오른쪽 위 접힌 종이 모서리 + 먼지
 *  - mindfulness (영혼 사원) — 하단에서 피어오르는 향 연기
 *  - nutrition (황금 들판) — 금빛 입자
 *  - social (광장 시장) — 컬러풀 confetti
 *  - productivity (시계탑) — 코너에 천천히 도는 톱니
 *  - wellness (온천 골짜기) — 하단 안개 breathing
 *  - trending (신비 차원) — 글리치 픽셀 shift
 *
 * 공통:
 *  - position: absolute; inset: 0; pointer-events: none
 *  - DungeonView 의 log/footer 위에 깔림 (z -1 상대)
 *  - reduced-motion 유저는 정적 tint 만 (키프레임 안 돎)
 *  - 모두 CSS keyframe — main thread 부하 없음
 */

import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { DungeonId } from "@/types/uphero";

interface DungeonAtmosphereProps {
  dungeonId: DungeonId;
}

export default function DungeonAtmosphere({
  dungeonId,
}: DungeonAtmosphereProps) {
  const reducedMotion = useReducedMotion();

  // reduced-motion: 각 던전의 signature color 만 남긴 정적 gradient tint.
  if (reducedMotion) {
    return <StaticTint dungeonId={dungeonId} />;
  }

  switch (dungeonId) {
    case "fitness":
      return <SnowFall />;
    case "learning":
      return <Library />;
    case "mindfulness":
      return <Incense />;
    case "nutrition":
      return <GoldDust />;
    case "social":
      return <Confetti />;
    case "productivity":
      return <ClockGears />;
    case "wellness":
      return <Mist />;
    case "trending":
      return <Glitch />;
    default:
      return null;
  }
}

/* ──────────────────────────────────────────────────────── */

/** 공통 wrapper — absolute full / 이벤트 차단 */
function AtmosphereLayer({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden"
      // z-index: 0 + parent 가 isolation: isolate 를 갖고 있어 Portal 밖으로 새지 않음.
      // 이후 in-flow 형제 (header/log/footer) 는 position: relative + z-index: 1 로
      // 위에 페인트 (positioned z:0 < positioned z:1 in stacking order).
      style={{ zIndex: 0, ...style }}
    >
      {children}
    </div>
  );
}

/** 고정된 가상 난수 — render 마다 좌표가 바뀌지 않게. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* ──────────────────────────────────────────────────────── */
/* fitness — 설산 눈송이 */

function SnowFall() {
  // 25개 dot 이 위 → 아래로 천천히. 각자 x 위치/duration/delay 다름.
  const flakes = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    left: `${pseudoRandom(i + 1) * 100}%`,
    size: 2 + Math.round(pseudoRandom(i + 100) * 2), // 2-4px
    duration: 8 + pseudoRandom(i + 200) * 6, // 8-14s
    delay: -pseudoRandom(i + 300) * 14, // 시작 시점 분산
    drift: (pseudoRandom(i + 400) - 0.5) * 20, // -10 ~ 10px 좌우 흔들림
    opacity: 0.3 + pseudoRandom(i + 500) * 0.3, // 0.3-0.6
  }));

  return (
    <AtmosphereLayer>
      {flakes.map((f) => (
        <span
          key={f.id}
          className="snow-flake absolute rounded-full"
          style={{
            left: f.left,
            top: "-10px",
            width: f.size,
            height: f.size,
            background: "#cdf564",
            opacity: f.opacity,
            animation: `snow-fall ${f.duration}s linear ${f.delay}s infinite`,
            // CSS var 로 drift 전달 (keyframe 에서 사용)
            ["--drift" as "color"]: `${f.drift}px`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes snow-fall {
          0% {
            transform: translateY(-10px) translateX(0);
            opacity: 0;
          }
          8% {
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) translateX(var(--drift));
            opacity: 0;
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* learning — 도서관: 우상단 접힌 종이 모서리 + 부유하는 먼지 */

function Library() {
  const dust = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${pseudoRandom(i + 1) * 100}%`,
    top: `${20 + pseudoRandom(i + 50) * 70}%`,
    duration: 10 + pseudoRandom(i + 200) * 8,
    delay: -pseudoRandom(i + 300) * 18,
    amp: 12 + pseudoRandom(i + 400) * 16, // 좌우 진폭
  }));

  return (
    <AtmosphereLayer>
      {/* 우상단 책장 접힘 — 작은 삼각형 fold */}
      <div
        className="absolute"
        style={{
          top: 0,
          right: 0,
          width: 36,
          height: 36,
          background: `linear-gradient(225deg, #a5c8db22 0%, #a5c8db14 50%, transparent 50%)`,
          clipPath: "polygon(100% 0, 0 0, 100% 100%)",
          borderBottomLeftRadius: 2,
        }}
      />
      {/* fold shadow — 접힌 부분 아래 그림자 */}
      <div
        className="absolute"
        style={{
          top: 34,
          right: 2,
          width: 2,
          height: 32,
          background: "linear-gradient(to bottom, #a5c8db33, transparent)",
          transform: "rotate(-45deg)",
          transformOrigin: "top right",
        }}
      />

      {/* 부유하는 먼지 입자 */}
      {dust.map((d) => (
        <span
          key={d.id}
          className="absolute rounded-full"
          style={{
            left: d.left,
            top: d.top,
            width: 2,
            height: 2,
            background: "#a5c8db",
            opacity: 0.35,
            animation: `library-dust ${d.duration}s ease-in-out ${d.delay}s infinite`,
            ["--amp" as "color"]: `${d.amp}px`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes library-dust {
          0%, 100% {
            transform: translate(0, 0);
            opacity: 0.2;
          }
          50% {
            transform: translate(var(--amp), -8px);
            opacity: 0.5;
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* mindfulness — 사원: 하단에서 피어오르는 향 연기 */

function Incense() {
  const smoke = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    left: `${20 + i * 15 + pseudoRandom(i + 10) * 5}%`,
    duration: 14 + pseudoRandom(i + 20) * 6,
    delay: -pseudoRandom(i + 30) * 10,
    size: 30 + pseudoRandom(i + 40) * 20,
  }));

  return (
    <AtmosphereLayer>
      {smoke.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: s.left,
            bottom: "-20px",
            width: s.size,
            height: s.size,
            background: `radial-gradient(circle, #c9b8e866 0%, transparent 70%)`,
            filter: "blur(8px)",
            animation: `incense-rise ${s.duration}s ease-out ${s.delay}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes incense-rise {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          20% {
            opacity: 0.9;
          }
          100% {
            transform: translateY(-100vh) scale(1.6);
            opacity: 0;
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* nutrition — 황금 들판: 금빛 입자 */

function GoldDust() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${pseudoRandom(i + 1) * 100}%`,
    top: `${pseudoRandom(i + 50) * 100}%`,
    duration: 6 + pseudoRandom(i + 100) * 5,
    delay: -pseudoRandom(i + 200) * 10,
    size: 2 + Math.round(pseudoRandom(i + 300) * 2),
  }));

  return (
    <AtmosphereLayer>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: "#e8d88b",
            boxShadow: "0 0 4px #e8d88bcc",
            animation: `gold-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes gold-float {
          0%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.2;
          }
          50% {
            transform: translateY(-12px) scale(1.25);
            opacity: 0.75;
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* social — 광장 시장: 컬러풀 confetti */

function Confetti() {
  const colors = ["#e8a8a8", "#e8d88b", "#87b8cd", "#cdf564"];
  const pieces = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    left: `${pseudoRandom(i + 1) * 100}%`,
    color: colors[i % colors.length],
    duration: 5 + pseudoRandom(i + 100) * 4,
    delay: -pseudoRandom(i + 200) * 10,
    size: 3 + Math.round(pseudoRandom(i + 300) * 2),
    rotate: Math.round(pseudoRandom(i + 400) * 360),
  }));

  return (
    <AtmosphereLayer>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute"
          style={{
            left: p.left,
            top: "-10px",
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: 0.7,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-10px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* productivity — 시계탑: 코너에 천천히 도는 톱니 */

function ClockGears() {
  return (
    <AtmosphereLayer>
      {/* 좌상단 big gear */}
      <svg
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          top: -40,
          left: -40,
          width: 180,
          height: 180,
          opacity: 0.08,
          animation: "gear-cw 60s linear infinite",
        }}
      >
        <GearShape />
      </svg>
      {/* 우하단 small gear — 반대 방향 */}
      <svg
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          bottom: -30,
          right: -30,
          width: 140,
          height: 140,
          opacity: 0.06,
          animation: "gear-ccw 80s linear infinite",
        }}
      >
        <GearShape />
      </svg>
      <style jsx global>{`
        @keyframes gear-cw {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes gear-ccw {
          to {
            transform: rotate(-360deg);
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/** 12-tooth gear SVG — stroke 만 */
function GearShape() {
  const teeth = Array.from({ length: 12 });
  return (
    <g fill="#bca88b" stroke="none">
      {teeth.map((_, i) => {
        const angle = (i / 12) * 360;
        return (
          <rect
            key={i}
            x={47}
            y={2}
            width={6}
            height={14}
            transform={`rotate(${angle} 50 50)`}
          />
        );
      })}
      <circle cx={50} cy={50} r={30} fill="none" stroke="#bca88b" strokeWidth={8} />
      <circle cx={50} cy={50} r={10} fill="#bca88b" />
    </g>
  );
}

/* ──────────────────────────────────────────────────────── */
/* wellness — 온천 골짜기: 하단 안개 breathing */

function Mist() {
  return (
    <AtmosphereLayer>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "-10%",
          right: "-10%",
          height: "45%",
          background: `linear-gradient(to top, #8bc9c944 0%, #8bc9c922 50%, transparent 100%)`,
          filter: "blur(18px)",
          animation: "mist-breathe 8s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "8%",
          left: "-20%",
          right: "-20%",
          height: "35%",
          background: `radial-gradient(ellipse at 30% 80%, #8bc9c933 0%, transparent 60%),
                       radial-gradient(ellipse at 70% 70%, #8bc9c922 0%, transparent 60%)`,
          filter: "blur(24px)",
          animation: "mist-drift 18s ease-in-out infinite",
        }}
      />
      <style jsx>{`
        @keyframes mist-breathe {
          0%, 100% {
            opacity: 0.6;
            transform: translateY(0);
          }
          50% {
            opacity: 1;
            transform: translateY(-6px);
          }
        }
        @keyframes mist-drift {
          0%, 100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(5%);
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* trending — 신비 차원: 글리치 scanline + 픽셀 shift */

function Glitch() {
  const pixels = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    top: `${pseudoRandom(i + 1) * 90 + 5}%`,
    duration: 4 + pseudoRandom(i + 100) * 3,
    delay: -pseudoRandom(i + 200) * 8,
    color: ["#cdf564", "#e88b7a", "#a5c8db"][i % 3],
  }));

  return (
    <AtmosphereLayer>
      {/* 수평 scanline — 미세한 주기적 이동 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 2px,
            rgba(205, 245, 100, 0.03) 2px,
            rgba(205, 245, 100, 0.03) 3px
          )`,
          animation: "scanline-drift 4s linear infinite",
        }}
      />
      {/* 주기적으로 나타나는 glitch pixel 조각 */}
      {pixels.map((p) => (
        <span
          key={p.id}
          className="absolute"
          style={{
            left: 0,
            top: p.top,
            width: 40,
            height: 2,
            background: p.color,
            opacity: 0,
            animation: `glitch-flash ${p.duration}s steps(5, end) ${p.delay}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes scanline-drift {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(3px);
          }
        }
        @keyframes glitch-flash {
          0%, 92%, 100% {
            opacity: 0;
            transform: translateX(0);
          }
          94% {
            opacity: 0.6;
            transform: translateX(20px);
          }
          96% {
            opacity: 0;
            transform: translateX(-10px);
          }
          98% {
            opacity: 0.4;
            transform: translateX(15px);
          }
        }
      `}</style>
    </AtmosphereLayer>
  );
}

/* ──────────────────────────────────────────────────────── */
/* reduced-motion 유저용 정적 tint — 키프레임 없이 signature color 만 */

const STATIC_TINTS: Record<DungeonId, string> = {
  fitness:
    "linear-gradient(to bottom, #87b87a0f 0%, transparent 50%)",
  learning:
    "linear-gradient(225deg, #a5c8db18 0%, transparent 40%)",
  mindfulness:
    "radial-gradient(ellipse at 50% 100%, #c9b8e822 0%, transparent 60%)",
  nutrition:
    "radial-gradient(ellipse at 50% 50%, #e8d88b14 0%, transparent 70%)",
  social:
    "linear-gradient(135deg, #e8a8a814 0%, transparent 50%, #cdf56414 100%)",
  productivity:
    "radial-gradient(circle at 0% 0%, #bca88b18 0%, transparent 50%), radial-gradient(circle at 100% 100%, #bca88b14 0%, transparent 50%)",
  wellness:
    "linear-gradient(to top, #8bc9c922 0%, transparent 50%)",
  trending:
    "linear-gradient(to bottom, #cdf5640a 0%, transparent 100%)",
};

function StaticTint({ dungeonId }: { dungeonId: DungeonId }) {
  return (
    <AtmosphereLayer style={{ background: STATIC_TINTS[dungeonId] }}>
      <span className="sr-only">던전 분위기 레이어 (motion reduced)</span>
    </AtmosphereLayer>
  );
}
