"use client";

/**
 * Phase 15 WarioWare — TracePath.
 *
 * 화면에 놓인 점(waypoint)들을 순서대로 손가락으로 쓸어 통과.
 *   diff 1: 4 점 (8s) / 2: 5 점 (7s) / 3: 6 점 (6s).
 *   포인터가 다음 점의 반경(r=28px) 안에 들어오면 진행. 시간 초과 실패.
 *   손가락 떼도 실패 아님 — 다시 잡아 이어 가도 OK (관대한 판정).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, MinigameHint, TimeBar, StatusMessage, GiveUpButton } from "./_chrome";

const FIELD_W = 280;
const FIELD_H = 280;
const HIT_R = 28;

interface Point {
  x: number;
  y: number;
}

function makePoints(n: number): Point[] {
  const margin = 40;
  const pts: Point[] = [];
  let tries = 0;
  while (pts.length < n && tries < 500) {
    tries++;
    const p = {
      x: margin + Math.random() * (FIELD_W - 2 * margin),
      y: margin + Math.random() * (FIELD_H - 2 * margin),
    };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 70)) pts.push(p);
  }
  return pts;
}

export default function TracePath({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const { n, durationMs } = useMemo(
    () => ({ 1: { n: 4, durationMs: 8000 }, 2: { n: 5, durationMs: 7000 }, 3: { n: 6, durationMs: 6000 } }[difficulty]),
    [difficulty],
  );
  const points = useMemo(() => makePoints(n), [n]);
  const [cleared, setCleared] = useState(0);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const clearedRef = useRef(0);
  clearedRef.current = cleared;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (done) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, durationMs - (now - start));
      setRemainingMs(left);
      if (left <= 0) {
        setDone((prev) => prev ?? "fail");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done, durationMs]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(
      () => onCompleteRef.current({ success: done === "success" }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done]);

  const onMove = (ev: React.PointerEvent) => {
    if (done) return;
    const el = fieldRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const nextIdx = clearedRef.current;
    if (nextIdx >= points.length) return;
    const tgt = points[nextIdx];
    if (Math.hypot(tgt.x - x, tgt.y - y) <= HIT_R) {
      const newCleared = nextIdx + 1;
      clearedRef.current = newCleared;
      setCleared(newCleared);
      if (newCleared >= points.length) setDone("success");
    }
  };

  const timePct = (remainingMs / durationMs) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: FIELD_W + 32 }}>
      <MinigameHeader>
        {t("uphero.mini.trace.header", { time: (remainingMs / 1000).toFixed(1), done: cleared, total: points.length })}
      </MinigameHeader>
      <TimeBar pct={timePct} maxWidthClass="" />
      <MinigameHint>{t("uphero.mini.trace.hint")}</MinigameHint>
      <div
        ref={fieldRef}
        onPointerDown={onMove}
        onPointerMove={onMove}
        className="relative rounded"
        style={{
          width: FIELD_W,
          height: FIELD_H,
          background: GB.darkest,
          border: `1px solid ${GB.dark}`,
          touchAction: "none",
          overflow: "hidden",
        }}
        aria-label={t("uphero.mini.trace.fieldAria")}
      >
        <svg width={FIELD_W} height={FIELD_H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {points.slice(0, Math.max(0, cleared)).map((p, i) =>
            i === 0 ? null : (
              <line
                key={i}
                x1={points[i - 1].x}
                y1={points[i - 1].y}
                x2={p.x}
                y2={p.y}
                stroke={GB.lightest}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ),
          )}
        </svg>
        {points.map((p, i) => {
          const isCleared = i < cleared;
          const isNext = i === cleared;
          return (
            <div
              key={i}
              className="trace-dot"
              style={{
                position: "absolute",
                left: p.x - 16,
                top: p.y - 16,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: isCleared ? `${GB.lightest}66` : isNext ? `${GB.lightest}33` : GB.dark,
                border: `2px solid ${isNext ? GB.lightest : GB.light}`,
                color: GB.lightest,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                pointerEvents: "none",
                boxShadow: isNext ? `0 0 8px ${GB.lightest}55` : undefined,
                ["--trace-i" as string]: i,
              }}
              aria-hidden="true"
            >
              {i + 1}
            </div>
          );
        })}
      </div>
      {done && (
        <StatusMessage kind={done}>
          {done === "success" ? t("uphero.mini.trace.success") : t("uphero.mini.trace.fail")}
        </StatusMessage>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .trace-dot {
          opacity: 0;
          transform: scale(0.85);
          animation: traceDotEnter 280ms ${EASE_OUT} forwards;
          animation-delay: calc(var(--trace-i) * 50ms);
          transition: background 200ms ${EASE_OUT}, border-color 200ms ${EASE_OUT}, box-shadow 200ms ${EASE_OUT};
        }
        @keyframes traceDotEnter {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .trace-dot {
            animation: none;
            transition: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
