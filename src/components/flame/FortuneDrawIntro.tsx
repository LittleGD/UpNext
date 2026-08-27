"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 오늘의 기운 뽑기 연출 — 그날 처음 열 때만, 폴라로이드가 던져지기 직전 한 번.
 *
 * 연출 어휘는 CardPackOpener 를 따른다(떠오름 → 흔들림으로 기대 쌓기 → 빛이 모였다
 * 터지는 halo 링 + 풀스크린 플래시). 다만 팩 개봉은 "보상 확인"이라 2.5초까지 끌어도
 * 되지만, 이건 **매일 아침 보는 연출**이라 길면 그대로 짐이 된다. 그래서 세 단계
 * 합계를 1.5초 아래로 묶고 흔들림 횟수도 절반으로 줄였다.
 *
 * 색은 오늘의 색(fortune.color.hex)을 쓴다 — 등급 색이 아니라 오늘의 색이어야
 * 이어서 나오는 폴라로이드의 글로우·아이콘과 같은 빛으로 읽힌다.
 *
 * reduced motion 이면 이 컴포넌트를 아예 마운트하지 않는다(호출부 책임).
 */

/** 단계 길이(ms). 합 = 연출 총 길이. 1.2~1.8초 예산 안. */
const RISE_MS = 460;
const SHAKE_MS = 520;
const BURST_MS = 500;

type Phase = "rise" | "shake" | "burst";

interface Props {
  /** 오늘의 색 — 카드 뒷면 문양, halo, 파티클, 플래시가 모두 이 색을 쓴다 */
  colorHex: string;
  /** 연출이 끝나 폴라로이드로 넘길 시점 */
  onComplete: () => void;
}

export default function FortuneDrawIntro({ colorHex, onComplete }: Props) {
  const { t } = useTranslation();
  const { play } = useSound();
  const [phase, setPhase] = useState<Phase>("rise");

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // StrictMode dev 더블 마운트에서 타임라인이 두 번 깔리는 것을 막는다
  // (CardPackOpener 와 같은 ref 가드).
  const startedRef = useRef(false);
  // onComplete 가 매 렌더 새 함수여도 타임라인을 다시 깔지 않도록 최신값만 참조
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const push = (fn: () => void, ms: number) => {
      timersRef.current.push(setTimeout(fn, ms));
    };

    push(() => {
      setPhase("shake");
      play("chargeUp");
    }, RISE_MS);
    push(() => {
      setPhase("burst");
      play("packOpen");
    }, RISE_MS + SHAKE_MS);
    push(() => onCompleteRef.current(), RISE_MS + SHAKE_MS + BURST_MS);

    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden">
      {/* 스크림 — 이어지는 폴라로이드 오버레이와 같은 값(black/60 + blur-sm)이라
          교체되는 순간 배경이 흔들리지 않는다. */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      />

      {/* 카드 뒤에 고인 빛 — 흔들리는 동안 부풀었다가 터질 때 한계까지 커진다 */}
      <motion.div
        className="absolute pointer-events-none"
        aria-hidden="true"
        style={{
          width: 320,
          height: 320,
          background: `radial-gradient(circle, ${colorHex}88 0%, ${colorHex}33 30%, transparent 65%)`,
          filter: "blur(24px)",
        }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={
          phase === "rise"
            ? { opacity: 0.35, scale: 0.8 }
            : phase === "shake"
              ? { opacity: [0.35, 0.7, 0.5, 0.85], scale: [0.8, 0.95, 0.9, 1.05] }
              : { opacity: [0.85, 1, 0], scale: [1.05, 1.9, 2.4] }
        }
        transition={{
          duration:
            (phase === "rise" ? RISE_MS : phase === "shake" ? SHAKE_MS : BURST_MS) / 1000,
          ease: phase === "shake" ? "easeInOut" : "easeOut",
        }}
      />

      {/* 터질 때 퍼지는 확장 링 — 팩 개봉의 haloRings 와 같은 어휘, 2개로 절제 */}
      {phase === "burst" && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          aria-hidden="true"
        >
          {[0, 1].map((i) => (
            <motion.div
              key={`ring-${i}`}
              className="absolute rounded-full"
              style={{
                width: 132,
                height: 132,
                boxShadow: `0 0 26px ${colorHex}, inset 0 0 18px ${colorHex}`,
                background: `radial-gradient(circle, transparent 62%, ${colorHex}66 78%, transparent 100%)`,
              }}
              initial={{ scale: 0.35, opacity: 0.8 }}
              animate={{ scale: 3.2 + i * 0.9, opacity: 0 }}
              transition={{ duration: 0.62 + i * 0.12, delay: i * 0.08, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* 풀스크린 플래시 — 폴라로이드가 던져지기 직전 화면을 한 번 채운다 */}
      {phase === "burst" && (
        <motion.div
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at center, ${colorHex} 0%, transparent 62%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{ duration: 0.44, times: [0, 0.28, 1], ease: "easeOut" }}
        />
      )}

      {/* 카드 뒷면 — 어둠에서 떠올라 흔들리다 빛으로 터지며 사라진다 */}
      <motion.div
        className="relative w-[132px] aspect-[3/4] rounded-lg bg-bg-elevated flex items-center justify-center overflow-hidden"
        style={{ boxShadow: `0 0 22px ${colorHex}44, 0 12px 32px rgba(0,0,0,0.5)` }}
        initial={{ y: 46, opacity: 0, scale: 0.82, rotate: -4 }}
        animate={
          phase === "rise"
            ? { y: 0, opacity: 1, scale: 1, rotate: 0 }
            : phase === "shake"
              ? { y: 0, opacity: 1, scale: [1, 1.06, 1.05, 1.09], rotate: [0, -7, 6, -4, 0] }
              : { y: -14, opacity: 0, scale: 1.42, rotate: 0 }
        }
        transition={{
          duration:
            (phase === "rise" ? RISE_MS : phase === "shake" ? SHAKE_MS : BURST_MS * 0.72) /
            1000,
          ease:
            phase === "rise"
              ? [0.16, 1, 0.3, 1]
              : phase === "shake"
                ? "easeInOut"
                : [0.32, 0, 0.67, 0],
        }}
      >
        {/* 뒷면 문양 — 아직 무엇인지 모르는 상태라 오늘의 색 실루엣만 보인다 */}
        <motion.span
          aria-hidden="true"
          animate={phase === "shake" ? { opacity: [0.5, 1, 0.7, 1] } : { opacity: 0.5 }}
          transition={{ duration: SHAKE_MS / 1000, ease: "easeInOut" }}
        >
          <PixelIcon name="Sparkles" size={40} color={colorHex} />
        </motion.span>
        {/* 뒷면을 훑는 빛 — 봉인이 아직 열리지 않았다는 신호 */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: `linear-gradient(150deg, ${colorHex}1f 0%, transparent 45%, ${colorHex}14 100%)`,
          }}
        />
      </motion.div>

      {/* 흔들리는 동안 새어 나오는 입자 — 각도/거리를 고정 테이블로 둬야
          리렌더마다 궤적이 바뀌지 않는다(FortuneOverlay 의 SPARKS 와 같은 이유).
          burst 에서도 언마운트하지 않는다 — 늦게 출발한 입자가 중간에 뚝 끊긴다. */}
      {phase !== "rise" && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {MOTES.map((m, i) => (
            <motion.span
              key={`mote-${i}`}
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: m.size,
                height: m.size,
                backgroundColor: colorHex,
                boxShadow: `0 0 8px ${colorHex}`,
              }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: Math.cos(m.angle) * m.distance,
                y: Math.sin(m.angle) * m.distance,
                opacity: [0, 1, 0],
                scale: [0.4, 1, 0.3],
              }}
              transition={{ duration: 0.52, delay: m.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* 캡션 — 폴라로이드 오버레이의 "탭해서 닫기" 와 같은 자리에 둬서
          두 화면이 이어질 때 텍스트가 튀지 않는다. */}
      <motion.p
        role="status"
        className="absolute bottom-[calc(env(safe-area-inset-bottom)+40px)] left-0 right-0 text-center typo-caption text-text-tertiary"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "burst" ? 0 : 1 }}
        transition={{ duration: 0.22, delay: phase === "rise" ? 0.14 : 0 }}
      >
        {t("fortune.draw.searching")}
      </motion.p>
    </div>
  );
}

/** 흔들림 단계 입자 — 8개면 충분하다. 반원 위쪽으로 치우치게 각도를 골랐다. */
const MOTES = [
  { angle: -2.4, distance: 96, size: 4, delay: 0.04 },
  { angle: -1.8, distance: 118, size: 3, delay: 0.12 },
  { angle: -1.1, distance: 88, size: 5, delay: 0 },
  { angle: -0.4, distance: 110, size: 3, delay: 0.18 },
  { angle: 0.3, distance: 92, size: 4, delay: 0.08 },
  { angle: 1.0, distance: 104, size: 3, delay: 0.22 },
  { angle: 3.5, distance: 86, size: 4, delay: 0.06 },
  { angle: 4.2, distance: 100, size: 3, delay: 0.16 },
] as const;
