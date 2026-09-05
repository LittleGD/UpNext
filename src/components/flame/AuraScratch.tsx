"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { beginSelectionHaptics, endSelectionHaptics, triggerHaptic } from "@/lib/sounds";
import {
  ALMOST_RATIO,
  HINT_FADE_SLOPE,
  PEEL_MS,
  PEEL_REDUCED_MS,
  SCRATCH_COLS,
  SCRATCH_ROWS,
  SCRATCH_TOTAL,
  TICK_MIN_DIST,
  TICK_MIN_MS,
  cellIndexAt,
  cellsAlongSegment,
  isNearTick,
  isRevealed,
} from "@/lib/scratchGrid";
import { useGameStore } from "@/store/useGameStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 문지르기 의식 — 리딩을 덮은 가림막을 손가락으로 문질러 드러낸다.
 * iOS AuraRitualCover(AuraReadingView.swift)와 같은 격자·임계·연출.
 *
 * 왜 캔버스가 아닌가: 픽셀 단위 지우개는 이 연출에 과하다. 필요한 건
 * "내 손으로 걷어냈다"는 감각이지 정교한 자국이 아니다. 거친 셀 격자(7×5)면
 * 저사양 기기에서도 프레임을 흘리지 않고, 픽셀아트 톤과도 맞는다.
 *
 * 타일 페인트: 셀마다 큰 그라디언트의 자기 조각(700%×500%)을 비추던 방식은 35장이
 * 각각 격자 전체 크기의 래스터를 만들어 저사양 안드로이드에서 문지르기가 뚝뚝
 * 끊겼다. 지금은 셀 하나가 자기 크기의 정적 3단 그라디언트(iOS coating)만 그리고,
 * 오늘의 색은 격자 전체에 얹은 틴트 층 한 장(iOS accent overlay)이 맡는다.
 *
 * 격자 기하와 임계치는 lib/scratchGrid 가 단일 출처다. 포인터 샘플 사이는
 * cellsAlongSegment 로 보간해 빠른 스와이프에도 칸이 건너뛰어지지 않고,
 * 루트 rect 는 pointerdown 에서 한 번 캐시해 move 마다 레이아웃을 읽지 않는다.
 *
 * 접근성: prefers-reduced-motion 이면 탭 1회로 즉시 공개한다. 문지르기를
 * 강제하면 운동 장애가 있는 유저는 기능 자체를 쓸 수 없다. 키보드는
 * Enter/Space 로 같은 경로를 탄다(가림막 자체가 button 이다).
 *
 * 햅틱: 문지르는 동안 은박이 손끝에서 갈리는 촉감을 준다. Capacitor 의
 * selectionChanged 는 selectionStart 뒤에만 울리므로 pointerdown 에서
 * beginSelectionHaptics(), 손을 떼면 endSelectionHaptics() 로 세션을 감싼다
 * (iOS Haptics.prepare(.selection) 과 같은 효과). hapticEnabled=false 면 전부 침묵.
 * 공개 순간의 성공 햅틱은 오버레이(AuraSection.handleReveal) 담당이라 여기서는 틱만.
 */

const CELLS = Array.from({ length: SCRATCH_TOTAL }, (_, i) => i);

/** 은박 코팅 — 필름 현상 전의 무광 회색(iOS coating 0.20/0.28/0.17 topLeading→bottomTrailing) */
const TILE_BG = "linear-gradient(135deg, #333331 0%, #474745 50%, #2b2b29 100%)";

type Point = { x: number; y: number };

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
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);
  const doneRef = useRef(false);
  const draggingRef = useRef(false);
  const peelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 루트 rect 캐시 — pointerdown 에서 채우고 resize/scroll 에서 비운다.
  const rectRef = useRef<DOMRect | null>(null);
  // 보간 기준점 — 직전 샘플. 손을 떼면 비워 다음 접촉이 새 세그먼트의 시작이 된다.
  const lastMarkPointRef = useRef<Point | null>(null);

  // 문지르기 틱 스로틀 — 시간(lastTickAt)과 이동거리(tickDist) 둘 다 본다.
  // 시간만 보면 제자리에서 떠는 손가락에도 틱이 나가고, 거리만 보면 빠른
  // 스와이프 한 번에 틱이 몰려 진동이 한 덩어리로 뭉개진다.
  const lastTickAtRef = useRef(0);
  const lastPointRef = useRef<Point | null>(null);
  const tickDistRef = useRef(0);
  const nearTickedRef = useRef(false);

  useEffect(() => {
    const invalidate = () => {
      rectRef.current = null;
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, true);
    window.visualViewport?.addEventListener("resize", invalidate);
    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate, true);
      window.visualViewport?.removeEventListener("resize", invalidate);
      if (peelTimerRef.current) clearTimeout(peelTimerRef.current);
    };
  }, []);

  const reveal = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onReveal();
  }, [onReveal]);

  /**
   * iOS finish(): 남은 칸을 한꺼번에 걷고(타일 페이드), 걷힘이 보인 뒤에야 공개
   * 콜백을 부른다. 예전엔 임계 도달 즉시 가림막 전체를 페이드해 유저가 직접
   * 걷어낸 자국이 보상 순간에 버려졌다.
   */
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markedRef.current = new Set(CELLS);
    setMarked(markedRef.current);
    setFinished(true);
    // 드래그 중 임계에 닿으면 세션을 여기서 닫는다 — 이후 pointerup 은 캡처 해제만.
    if (draggingRef.current && hapticEnabled) endSelectionHaptics();
    draggingRef.current = false;
    peelTimerRef.current = setTimeout(reveal, prefersReducedMotion ? PEEL_REDUCED_MS : PEEL_MS);
  }, [reveal, hapticEnabled, prefersReducedMotion]);

  const scratchTick = useCallback(
    (clientX: number, clientY: number) => {
      if (!hapticEnabled || finishedRef.current) return;
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

  const getRect = useCallback((): DOMRect | null => {
    if (rectRef.current) return rectRef.current;
    const el = rootRef.current;
    if (!el) return null;
    rectRef.current = el.getBoundingClientRect();
    return rectRef.current;
  }, []);

  /** 포인터 샘플들을 직전 점부터 이어 보간해 지나간 칸을 전부 기록한다. */
  const markPoints = useCallback(
    (points: Point[]) => {
      if (finishedRef.current || points.length === 0) return;
      const rect = getRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const cells = markedRef.current;
      const before = cells.size;
      for (const p of points) {
        const last = lastMarkPointRef.current;
        if (last) {
          cellsAlongSegment(
            last.x - rect.left,
            last.y - rect.top,
            p.x - rect.left,
            p.y - rect.top,
            rect.width,
            rect.height,
            cells,
          );
        } else {
          cells.add(cellIndexAt(p.x - rect.left, p.y - rect.top, rect.width, rect.height));
        }
        lastMarkPointRef.current = p;
      }
      if (cells.size === before) return;
      setMarked(new Set(cells));

      // 임박 신호 — selection 보다 한 단계 무거운 light 임팩트. 공개 직전의
      // "거의 다 왔다"를 손끝으로 먼저 알린다. 정확히 1회.
      if (hapticEnabled && !nearTickedRef.current && isNearTick(cells.size)) {
        nearTickedRef.current = true;
        triggerHaptic("cardFlip");
      }
      if (isRevealed(cells.size)) finish();
    },
    [getRect, finish, hapticEnabled],
  );

  const endDrag = useCallback(
    (pointerId?: number) => {
      const wasDragging = draggingRef.current;
      draggingRef.current = false;
      lastPointRef.current = null;
      lastMarkPointRef.current = null;
      tickDistRef.current = 0;
      if (wasDragging && hapticEnabled) endSelectionHaptics();
      if (pointerId === undefined) return;
      try {
        rootRef.current?.releasePointerCapture(pointerId);
      } catch {
        // 이미 해제된 포인터 — 무시
      }
    },
    [hapticEnabled],
  );

  const ratio = marked.size / SCRATCH_TOTAL;
  const hint =
    // reduced motion 이면 문지르기가 아니라 탭 1회로 열린다. 그때도 "문질러라"고
    // 안내하면 **되지 않는 동작을 시키는 상태**라, 스크린리더 사용자는 경로를 못 찾는다.
    prefersReducedMotion
      ? t("aura.ritual.tap")
      : ratio >= ALMOST_RATIO
        ? t("aura.ritual.almost")
        : t("aura.ritual.hint");

  return (
    <motion.div
      className="absolute inset-0 z-10"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      <button
        ref={rootRef}
        type="button"
        aria-label={hint}
        className="absolute inset-0 overflow-hidden rounded-[3px]"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={(e) => {
          if (prefersReducedMotion || finishedRef.current) return;
          draggingRef.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // 캡처 실패해도 엘리먼트 위에서는 move 가 계속 들어온다
          }
          rectRef.current = e.currentTarget.getBoundingClientRect();
          // 첫 접촉 틱 — "여기가 문질러지는 곳"이라는 즉답. 이후 틱의 기준점도 여기.
          lastPointRef.current = { x: e.clientX, y: e.clientY };
          tickDistRef.current = 0;
          if (hapticEnabled) {
            beginSelectionHaptics();
            lastTickAtRef.current = performance.now();
            triggerHaptic("select");
          }
          lastMarkPointRef.current = null;
          markPoints([{ x: e.clientX, y: e.clientY }]);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const native = e.nativeEvent;
          const coalesced =
            typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
          const source = coalesced.length > 0 ? coalesced : [native];
          markPoints(source.map((ev) => ({ x: ev.clientX, y: ev.clientY })));
          scratchTick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => endDrag(e.pointerId)}
        onPointerCancel={(e) => endDrag(e.pointerId)}
        onClick={() => {
          // 탭 1회 공개는 reduced motion 전용. 그렇지 않으면 문지르기가 장식이 된다.
          if (prefersReducedMotion) finish();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          // 포인터가 없는 입력에는 문지를 방법이 없다 — 키 입력은 항상 즉시 공개.
          e.preventDefault();
          finish();
        }}
      >
        <span
          className="absolute inset-0 grid"
          aria-hidden="true"
          style={{
            gridTemplateColumns: `repeat(${SCRATCH_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${SCRATCH_ROWS}, 1fr)`,
          }}
        >
          {CELLS.map((index) => {
            const off = marked.has(index);
            return (
              <span
                key={index}
                data-scratch-tile=""
                style={{
                  backgroundImage: TILE_BG,
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

        {/* 남은 면적을 알리는 결 — 오늘의 색이 코팅 위를 얇게 흐른다(iOS accent overlay) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `linear-gradient(135deg, ${colorHex}24 0%, transparent 50%, ${colorHex}1a 100%)`,
            opacity: finished ? 0 : 1,
          }}
        />

        {/* 안내 — 덮개 한가운데. 문지를수록 옅어져 걷힌 인화지 위에 글자가 남지 않는다. */}
        <span
          aria-hidden="true"
          data-scratch-hint=""
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-[18px] text-center transition-opacity duration-150"
          style={{ opacity: Math.max(0, 1 - ratio * HINT_FADE_SLOPE) }}
        >
          <PixelIcon name="Sparkle" size={18} color={colorHex} />
          <span
            className={`typo-caption ${
              ratio >= ALMOST_RATIO ? "text-text-primary" : "text-text-secondary"
            }`}
          >
            {hint}
          </span>
        </span>
      </button>
    </motion.div>
  );
}
