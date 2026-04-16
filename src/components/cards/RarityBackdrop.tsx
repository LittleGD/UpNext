"use client";

import { motion } from "framer-motion";
import { useMemo, type CSSProperties } from "react";
import type { Rarity } from "@/types/card";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * 등급별 3D 카드 뒷배경 이펙트.
 * Card3DViewer 를 감싸는 모달/오버레이 안에서 card 뒤에 배치한다.
 *
 * 성능 설계 (Codex adversarial review 반영):
 * - 반복 루프 전부 CSS @keyframes (globals.css) 로 실행 — off-main-thread + GPU.
 * - framer-motion 은 루트의 entrance/exit 에만 사용 → 50+ rAF 부하 제거.
 * - `contain: layout paint` 로 repaint 영향 범위 격리.
 * - 네거티브 animation-delay 로 mount 즉시 mid-phase 진입 (파편·반짝임·궤도 입자).
 * - 서로소 주기(13/15/17/19s breath vs 28/30/33/41/46s spin)로 패턴 감지 억제.
 *
 * 등급별 개성:
 * - normal: 약한 halo pulse
 * - rare: 회전 오로라 + 수평 커튼
 * - unique: 중앙 코어 + 방사 광선(wrapper 회전+호흡) + 에너지 파편
 * - legend: 거대 영광 + 다층 광선 + 궤도 입자 + 반짝임 + shimmer sweep
 *
 * Emil 원칙 반영:
 * - `scale(0)` 금지 → 파편/반짝임 모두 `scale(0.3)` 또는 `scale(0.4)` 부터 시작
 * - blur 값 20px 가이드라인 준수 쪽으로 튜닝 (Rare 50/60/35, Unique 18/22/22, Legend 20/22/22/30)
 * - 커스텀 cubic-bezier(0.45,0,0.55,1) — 기본 ease 보다 의도적 sine 곡선
 */

interface RarityBackdropProps {
  rarity: Rarity;
}

// 루트 entrance — 모달의 0.35s spring 과 sync
const ENTER_TRANSITION = { duration: 0.35, ease: [0.23, 1, 0.32, 1] as const };
const EXIT_TRANSITION = { duration: 0.25, ease: [0.32, 0, 0.67, 0] as const };

export default function RarityBackdrop({ rarity }: RarityBackdropProps) {
  const color = RARITY_CONFIG[rarity].color;
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={ENTER_TRANSITION}
      style={{ contain: "layout paint" }}
    >
      {rarity === "normal" && <NormalBackdrop reducedMotion={reducedMotion} />}
      {rarity === "rare" && <RareBackdrop color={color} reducedMotion={reducedMotion} />}
      {rarity === "unique" && <UniqueBackdrop color={color} reducedMotion={reducedMotion} />}
      {rarity === "legend" && <LegendBackdrop color={color} reducedMotion={reducedMotion} />}
    </motion.div>
  );
}

/* ── NORMAL ── */
function NormalBackdrop({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 55vmin 55vmin at center, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 35%, transparent 65%)",
        opacity: reducedMotion ? 0.35 : undefined,
        animation: reducedMotion
          ? undefined
          : "rb-halo-pulse 5s cubic-bezier(0.45,0,0.55,1) infinite",
      }}
    />
  );
}

/* ── RARE ── */
function RareBackdrop({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.45,
          background: `radial-gradient(ellipse at center, ${color}44 0%, ${color}11 40%, transparent 70%)`,
        }}
      />
    );
  }
  return (
    <>
      {/* 메인 오로라 — 시계 회전 + 오퍼시티 펄스 (두 keyframe 병렬) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: "200vmax",
            height: "200vmax",
            background: `conic-gradient(from 0deg, transparent 0deg, ${color}55 60deg, transparent 140deg, ${color}44 220deg, transparent 300deg, ${color}33 340deg, transparent 360deg)`,
            filter: "blur(50px)",
            animation:
              "rb-spin-cw 28s linear infinite, rb-aurora-op-a 5s cubic-bezier(0.45,0,0.55,1) infinite",
          }}
        />
      </div>
      {/* 반대 방향 — 깊이감 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: "180vmax",
            height: "180vmax",
            background: `conic-gradient(from 45deg, transparent 0deg, ${color}44 80deg, transparent 160deg, ${color}33 240deg, transparent 320deg)`,
            filter: "blur(60px)",
            animation:
              "rb-spin-ccw 40s linear infinite, rb-aurora-op-b 7s cubic-bezier(0.45,0,0.55,1) 1s infinite",
          }}
        />
      </div>
      {/* 수평 커튼 */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: "35%",
          height: "30%",
          background: `linear-gradient(90deg, transparent 0%, ${color}33 25%, ${color}66 50%, ${color}33 75%, transparent 100%)`,
          filter: "blur(35px)",
          animation: "rb-rare-curtain 14s cubic-bezier(0.45,0,0.55,1) infinite",
        }}
      />
    </>
  );
}

/* ── UNIQUE ── */
function UniqueBackdrop({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  // 파편 — 각 입자의 방향을 CSS 변수로 주입해 단일 keyframe 재사용
  const fragments = useMemo(() => {
    return Array.from({ length: 16 }).map((_, i) => {
      const angle = ((i / 16) * Math.PI * 2) + ((i * 37) % 11) * 0.07;
      const distance = 180 + ((i * 53) % 90);
      const size = 4 + ((i * 29) % 5);
      const duration = 2.6 + ((i * 0.31) % 1.6);
      const delay = -((i * 0.23) % 2.4); // 네거티브 delay — mount 즉시 mid-phase
      return {
        i,
        size,
        duration,
        delay,
        fx1: Math.cos(angle) * distance,
        fy1: Math.sin(angle) * distance,
        fx2: Math.cos(angle) * distance * 1.6,
        fy2: Math.sin(angle) * distance * 1.6,
      };
    });
  }, []);

  if (reducedMotion) {
    return (
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.5,
          background: `radial-gradient(circle at center, ${color}66 0%, ${color}22 20%, transparent 50%)`,
        }}
      />
    );
  }

  return (
    <>
      {/* 중앙 코어 — 맥동 (opacity+scale) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: "65vmin",
            height: "65vmin",
            background: `radial-gradient(circle, ${color} 0%, ${color}66 14%, ${color}22 35%, transparent 60%)`,
            filter: "blur(22px)",
            animation: "rb-unique-core 3s cubic-bezier(0.45,0,0.55,1) infinite",
          }}
        />
      </div>

      {/* 메인 방사 광선 — wrapper 패턴 (outer rotate, inner breath) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{ animation: "rb-spin-cw 30s linear infinite" }}>
          <div
            style={{
              width: "220vmax",
              height: "220vmax",
              background: `conic-gradient(from 0deg,
                transparent 0deg, ${color}22 8deg, ${color}55 20deg, ${color}22 32deg, transparent 44deg,
                transparent 68deg, ${color}22 76deg, ${color}44 88deg, ${color}22 100deg, transparent 112deg,
                transparent 130deg, ${color}22 138deg, ${color}55 150deg, ${color}22 162deg, transparent 174deg,
                transparent 196deg, ${color}22 204deg, ${color}44 216deg, ${color}22 228deg, transparent 240deg,
                transparent 260deg, ${color}22 268deg, ${color}55 280deg, ${color}22 292deg, transparent 304deg,
                transparent 324deg, ${color}22 332deg, ${color}44 344deg, ${color}22 356deg, transparent 360deg)`,
              maskImage:
                "radial-gradient(circle at center, black 0%, black 20%, rgba(0,0,0,0.4) 55%, transparent 85%)",
              WebkitMaskImage:
                "radial-gradient(circle at center, black 0%, black 20%, rgba(0,0,0,0.4) 55%, transparent 85%)",
              filter: "blur(18px)",
              opacity: 0.65,
              animation: "rb-breath-98-106 13s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>

      {/* 보조 광선 — 반대 방향, 서로소 주기 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{ animation: "rb-spin-ccw 41s linear infinite" }}>
          <div
            style={{
              width: "200vmax",
              height: "200vmax",
              background: `conic-gradient(from 30deg,
                transparent 0deg, ${color}22 15deg, ${color}44 30deg, ${color}22 45deg, transparent 60deg,
                transparent 105deg, ${color}22 120deg, ${color}33 135deg, ${color}22 150deg, transparent 165deg,
                transparent 210deg, ${color}22 225deg, ${color}44 240deg, ${color}22 255deg, transparent 270deg,
                transparent 315deg, ${color}22 330deg, ${color}33 345deg, ${color}22 360deg)`,
              maskImage:
                "radial-gradient(circle at center, black 0%, black 18%, rgba(0,0,0,0.35) 55%, transparent 88%)",
              WebkitMaskImage:
                "radial-gradient(circle at center, black 0%, black 18%, rgba(0,0,0,0.35) 55%, transparent 88%)",
              filter: "blur(22px)",
              opacity: 0.45,
              animation: "rb-breath-100-108 17s cubic-bezier(0.45,0,0.55,1) 2s infinite",
            }}
          />
        </div>
      </div>

      {/* 방사 에너지 파편 — 단일 keyframe + CSS vars per particle */}
      {fragments.map(({ i, size, duration, delay, fx1, fy1, fx2, fy2 }) => (
        <div
          key={`frag-${i}`}
          className="absolute rounded-full"
          style={{
            top: "50%",
            left: "50%",
            marginLeft: -size / 2,
            marginTop: -size / 2,
            width: size,
            height: size,
            background: color,
            boxShadow: `0 0 ${size * 3}px ${color}, 0 0 ${size * 6}px ${color}88`,
            "--rb-fx1": `${fx1}px`,
            "--rb-fy1": `${fy1}px`,
            "--rb-fx2": `${fx2}px`,
            "--rb-fy2": `${fy2}px`,
            animation: `rb-frag-emanate ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}s infinite`,
          } as CSSProperties}
        />
      ))}
    </>
  );
}

/* ── LEGEND ── */
function LegendBackdrop({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  const sparkles = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => {
      const x = ((i * 73 + 11) % 90) + 5;
      const y = ((i * 41 + 19) % 90) + 5;
      const size = 2 + (i % 3);
      const duration = 1.6 + ((i * 0.29) % 1.9);
      const delay = -((i * 0.47) % 2.8);
      return { i, x, y, size, duration, delay };
    });
  }, []);

  // 궤도 입자 — 네거티브 delay 로 각 입자가 다른 시작각에서 출발하도록 phase 오프셋
  const orbits = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const startAngleDeg = (i / 12) * 360;
      const radiusPx = 160 + (i % 3) * 45;
      const particleSize = 5 + (i % 2) * 3;
      const orbitDuration = 14 + (i % 3) * 3;
      const delay = -(startAngleDeg / 360) * orbitDuration; // 네거티브 delay = phase shift
      return { i, radiusPx, particleSize, orbitDuration, delay };
    });
  }, []);

  if (reducedMotion) {
    return (
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.55,
          background: `radial-gradient(circle at center, ${color}77 0%, ${color}33 22%, ${color}11 45%, transparent 68%)`,
        }}
      />
    );
  }

  return (
    <>
      {/* 거대 영광 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: "85vmin",
            height: "85vmin",
            background: `radial-gradient(circle, ${color} 0%, ${color}99 9%, ${color}55 22%, ${color}22 42%, transparent 65%)`,
            filter: "blur(22px)",
            animation: "rb-legend-core 4s cubic-bezier(0.45,0,0.55,1) infinite",
          }}
        />
      </div>

      {/* 메인 광선 — wrapper rotate + inner breath */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{ animation: "rb-spin-cw 46s linear infinite" }}>
          <div
            style={{
              width: "240vmax",
              height: "240vmax",
              background: `conic-gradient(from 0deg,
                ${color}00 0deg, ${color}22 6deg, ${color}55 16deg, ${color}22 26deg, ${color}00 36deg,
                ${color}00 58deg, ${color}22 64deg, ${color}44 76deg, ${color}22 88deg, ${color}00 98deg,
                ${color}00 115deg, ${color}22 122deg, ${color}55 134deg, ${color}22 146deg, ${color}00 156deg,
                ${color}00 170deg, ${color}22 178deg, ${color}44 190deg, ${color}22 202deg, ${color}00 212deg,
                ${color}00 224deg, ${color}22 232deg, ${color}55 244deg, ${color}22 256deg, ${color}00 266deg,
                ${color}00 278deg, ${color}22 286deg, ${color}44 298deg, ${color}22 310deg, ${color}00 320deg,
                ${color}00 332deg, ${color}22 340deg, ${color}55 352deg, ${color}22 360deg)`,
              maskImage:
                "radial-gradient(circle at center, black 0%, black 18%, rgba(0,0,0,0.45) 55%, transparent 90%)",
              WebkitMaskImage:
                "radial-gradient(circle at center, black 0%, black 18%, rgba(0,0,0,0.45) 55%, transparent 90%)",
              filter: "blur(20px)",
              opacity: 0.6,
              animation: "rb-breath-97-105 15s cubic-bezier(0.45,0,0.55,1) infinite",
            }}
          />
        </div>
      </div>

      {/* 반대 방향 광선 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{ animation: "rb-spin-ccw 33s linear infinite" }}>
          <div
            style={{
              width: "200vmax",
              height: "200vmax",
              background: `conic-gradient(from 30deg,
                transparent 0deg, ${color}22 14deg, ${color}55 28deg, ${color}22 42deg, transparent 56deg,
                transparent 110deg, ${color}22 124deg, ${color}44 138deg, ${color}22 152deg, transparent 166deg,
                transparent 230deg, ${color}22 244deg, ${color}55 258deg, ${color}22 272deg, transparent 286deg,
                transparent 350deg, ${color}22 360deg)`,
              maskImage:
                "radial-gradient(circle at center, black 0%, black 15%, rgba(0,0,0,0.35) 55%, transparent 90%)",
              WebkitMaskImage:
                "radial-gradient(circle at center, black 0%, black 15%, rgba(0,0,0,0.35) 55%, transparent 90%)",
              filter: "blur(22px)",
              opacity: 0.5,
              animation: "rb-breath-100-107 19s cubic-bezier(0.45,0,0.55,1) 3s infinite",
            }}
          />
        </div>
      </div>

      {/* 궤도 입자 — 네거티브 delay = phase offset 으로 시작 각도 분배 */}
      {orbits.map(({ i, radiusPx, particleSize, orbitDuration, delay }) => (
        <div key={`orbit-${i}`} className="absolute inset-0 flex items-center justify-center">
          <div
            style={{
              width: radiusPx * 2,
              height: radiusPx * 2,
              animation: `rb-spin-cw ${orbitDuration}s linear ${delay}s infinite`,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                marginLeft: -particleSize / 2,
                width: particleSize,
                height: particleSize,
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 ${particleSize * 3}px ${color}, 0 0 ${particleSize * 6}px ${color}aa`,
              }}
            />
          </div>
        </div>
      ))}

      {/* 반짝임 별 */}
      {sparkles.map(({ i, x, y, size, duration, delay }) => (
        <div
          key={`sparkle-${i}`}
          className="absolute"
          style={{
            top: `${y}%`,
            left: `${x}%`,
            width: size,
            height: size,
            borderRadius: "50%",
            background: "white",
            boxShadow: `0 0 ${size * 2}px ${color}, 0 0 ${size * 4}px ${color}cc`,
            animation: `rb-sparkle ${duration}s cubic-bezier(0.45,0,0.55,1) ${delay}s infinite`,
          }}
        />
      ))}

      {/* 대각 shimmer sweep */}
      <div
        className="absolute"
        style={{
          top: "-50%",
          left: "-50%",
          right: "-50%",
          bottom: "-50%",
          background: `linear-gradient(115deg, transparent 42%, ${color}33 50%, transparent 58%)`,
          filter: "blur(30px)",
          animation: "rb-legend-sweep 5s cubic-bezier(0.45,0,0.55,1) infinite",
        }}
      />
    </>
  );
}
