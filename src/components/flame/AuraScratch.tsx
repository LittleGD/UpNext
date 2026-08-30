"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { triggerHaptic } from "@/lib/sounds";
import { useGameStore } from "@/store/useGameStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 문지르기 의식 — 리딩을 덮은 가림막을 손가락으로 문질러 드러낸다.
 *
 * 왜 캔버스가 아닌가: 픽셀 단위 지우개는 이 연출에 과하다. 필요한 건
 * "내 손으로 걷어냈다"는 감각이지 정교한 자국이 아니다. 거친 셀 격자(7×5)면
 * 저사양 기기에서도 프레임을 흘리지 않고, 픽셀아트 톤과도 맞는다.
 *
 * 접근성: prefers-reduced-motion 이면 탭 1회로 즉시 공개한다. 문지르기를
 * 강제하면 운동 장애가 있는 유저는 기능 자체를 쓸 수 없다. 키보드는
 * Enter/Space 로 같은 경로를 탄다(가림막 자체가 button 이다).
 *
 * 햅틱: 문지르는 동안 은박이 손끝에서 갈리는 촉감을 준다. 사운드 없이 진동만
 * 필요한 자리라 useSound.play(사운드+햅틱 결합) 대신 같은 경로의 재료
 * (progress.hapticEnabled + lib/sounds.triggerHaptic)를 직접 쓴다.
 * hapticEnabled=false 면 전부 침묵. 공개 순간의 성공 햅틱은 오버레이
 * (AuraSection.handleReveal) 담당이라 여기서는 틱만 다룬다.
 */

const COLS = 7;
const ROWS = 5;
const TOTAL = COLS * ROWS;
/** 이 비율만큼 지나가면 공개. 낮으면 의식이 안 되고, 높으면 노동이 된다. */
const REVEAL_RATIO = 0.45;
/** 안내 문구가 "조금만 더" 로 바뀌는 지점 */
const ALMOST_RATIO = 0.3;

/** 문지르기 틱 최소 간격(ms). 이보다 잦으면 진동이 뭉개져 소음이 된다. */
const TICK_MIN_MS = 40;
/** 틱 하나가 요구하는 이동 거리(px). 시간·거리 둘 다 채워야 틱이 나간다. */
const TICK_MIN_DIST = 24;
/** 공개 임계 대비 이 비율(80%)을 넘으면 한 단계 무거운 틱으로 "임박"을 알린다. */
const NEAR_TICK_RATIO = 0.8;

const CELLS = Array.from({ length: TOTAL }, (_, i) => i);

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export default function AuraScratch({
  colorHex,
  onReveal,
}: {
  /** 오늘의 색 — 가림막 은박에 섞어 폴라로이드와 한 벌로 읽히게 한다 */
  colorHex: string;
  /** 공개 임계치 도달. 정확히 1회만 호출된다. */
  onReveal: () => void;
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  const rootRef = useRef<HTMLButtonElement>(null);
  // 렌더용 state 와 별개로 ref 를 둔다 — pointermove 는 setState 반영을 기다릴
  // 여유가 없어서, 같은 프레임에 들어온 두 이벤트가 서로의 갱신을 덮어쓴다.
  const markedRef = useRef<Set<number>>(new Set());
  const [marked, setMarked] = useState<ReadonlySet<number>>(() => new Set<number>());
  const doneRef = useRef(false);
  const draggingRef = useRef(false);

  // 문지르기 틱 스로틀 — 시간(lastTickAt)과 이동거리(tickDist) 둘 다 본다.
  // 시간만 보면 제자리에서 떠는 손가락에도 틱이 나가고, 거리만 보면 빠른
  // 스와이프 한 번에 틱이 몰려 진동이 한 덩어리로 뭉개진다.
  const lastTickAtRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const tickDistRef = useRef(0);
  const nearTickedRef = useRef(false);

  const reveal = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onReveal();
  }, [onReveal]);

  const scratchTick = useCallback(
    (clientX: number, clientY: number) => {
      if (!hapticEnabled || doneRef.current) return;
      const last = lastPointRef.current;
      lastPointRef.current = { x: clientX, y: clientY };
      if (!last) return;
      tickDistRef.current += Math.hypot(clientX - last.x, clientY - last.y);
      const now = performance.now();
      if (tickDistRef.current < TICK_MIN_DIST || now - lastTickAtRef.current < TICK_MIN_MS) {
        return;
      }
      tickDistRef.current = 0;
      lastTickAtRef.current = now;
      // selection 급 — 가장 가벼운 틱. 은박 갈리는 "사각사각"의 촉각 버전.
      triggerHaptic("select");
    },
    [hapticEnabled],
  );

  const markAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = rootRef.current;
      if (!el || doneRef.current) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const col = clamp(Math.floor(((clientX - rect.left) / rect.width) * COLS), 0, COLS - 1);
      const row = clamp(Math.floor(((clientY - rect.top) / rect.height) * ROWS), 0, ROWS - 1);
      const index = row * COLS + col;
      if (markedRef.current.has(index)) return;

      markedRef.current.add(index);
      setMarked(new Set(markedRef.current));

      const goal = TOTAL * REVEAL_RATIO;
      // 임박 신호 — selection 보다 한 단계 무거운 light 임팩트. 공개 직전의
      // "거의 다 왔다"를 손끝으로 먼저 알린다. 정확히 1회.
      if (
        hapticEnabled &&
        !nearTickedRef.current &&
        markedRef.current.size >= goal * NEAR_TICK_RATIO &&
        markedRef.current.size < goal
      ) {
        nearTickedRef.current = true;
        triggerHaptic("cardFlip");
      }
      if (markedRef.current.size >= goal) reveal();
    },
    [reveal, hapticEnabled],
  );

  const endDrag = useCallback((pointerId?: number) => {
    draggingRef.current = false;
    lastPointRef.current = null;
    tickDistRef.current = 0;
    if (pointerId === undefined) return;
    try {
      rootRef.current?.releasePointerCapture(pointerId);
    } catch {
      // 이미 해제된 포인터 — 무시
    }
  }, []);

  const ratio = marked.size / TOTAL;
  // reduced motion 경로는 문지르기를 요구하지 않으므로 진행 문구도 쓰지 않는다.
  const hint =
    // reduced motion 이면 문지르기가 아니라 탭 1회로 열린다. 그때도 "문질러라"고
    // 안내하면 **되지 않는 동작을 시키는 상태**라, 스크린리더 사용자는 경로를 못 찾는다.
    prefersReducedMotion
      ? t("aura.ritual.tap")
      : ratio >= ALMOST_RATIO
        ? t("aura.ritual.almost")
        : t("aura.ritual.hint");

  // 셀마다 큰 그라디언트의 자기 조각만 비춘다 — 35장이 모여 한 장의 은박이 된다.
  const tiles = useMemo(
    () =>
      CELLS.map((index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        return {
          index,
          position: `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`,
        };
      }),
    [],
  );

  return (
    <motion.div
      className="absolute inset-0 z-10"
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: prefersReducedMotion ? 0.12 : 0.3, ease: "easeOut" }}
    >
      <button
        ref={rootRef}
        type="button"
        aria-label={hint}
        className="absolute inset-0 overflow-hidden rounded-sm"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={(e) => {
          if (prefersReducedMotion) return;
          draggingRef.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // 캡처 실패해도 엘리먼트 위에서는 move 가 계속 들어온다
          }
          // 첫 접촉 틱 — "여기가 문질러지는 곳"이라는 즉답. 이후 틱의 기준점도 여기.
          lastPointRef.current = { x: e.clientX, y: e.clientY };
          tickDistRef.current = 0;
          if (hapticEnabled && !doneRef.current) {
            lastTickAtRef.current = performance.now();
            triggerHaptic("select");
          }
          markAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          markAt(e.clientX, e.clientY);
          scratchTick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => endDrag(e.pointerId)}
        onPointerCancel={(e) => endDrag(e.pointerId)}
        onClick={() => {
          // 탭 1회 공개는 reduced motion 전용. 그렇지 않으면 문지르기가 장식이 된다.
          if (prefersReducedMotion) reveal();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          // 포인터가 없는 입력에는 문지를 방법이 없다 — 키 입력은 항상 즉시 공개.
          e.preventDefault();
          reveal();
        }}
      >
        <span
          className="absolute inset-0 grid"
          aria-hidden="true"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
        >
          {tiles.map(({ index, position }) => {
            const off = marked.has(index);
            return (
              <span
                key={index}
                style={{
                  backgroundImage: `linear-gradient(132deg, ${colorHex}66, #16161a 46%, #24242a 62%, ${colorHex}3d)`,
                  backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
                  backgroundPosition: position,
                  opacity: off ? 0 : 1,
                  transform: off ? "scale(0.82)" : "scale(1)",
                  transition: prefersReducedMotion
                    ? "none"
                    : "opacity 240ms ease-out, transform 240ms ease-out",
                }}
              />
            );
          })}
        </span>
      </button>

      {/* 안내는 가림막 밖(아래)에 둔다 — 안에 두면 가운데 셀이 걷히는 순간
          글자가 인화지 위에 떠 읽기 힘들어진다. */}
      <p
        className="absolute left-0 right-0 top-full mt-4 text-center typo-caption text-text-secondary pointer-events-none"
        aria-hidden="true"
      >
        {hint}
      </p>
    </motion.div>
  );
}
