"use client";

/**
 * Phase 15 WarioWare — SpotDiff.
 *
 * 두 그리드 중 1 칸이 다르다. 제한 시간 안에 다른 칸을 탭.
 *   diff 1: 4x4 (8s), 2: 5x5 (7s), 3: 6x6 (6s). 오답 탭 즉시 실패.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

const SYMBOLS = ["◆", "●", "■", "▲", "★", "♥"];

function makeGrid(size: number): { base: string[]; diffIdx: number; altSym: string } {
  const cells = size * size;
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const base = Array.from({ length: cells }, () => sym);
  const diffIdx = Math.floor(Math.random() * cells);
  let altSym = sym;
  while (altSym === sym) altSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  return { base, diffIdx, altSym };
}

export default function SpotDiff({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const { size, durationMs } = useMemo(
    () => ({ 1: { size: 4, durationMs: 8000 }, 2: { size: 5, durationMs: 7000 }, 3: { size: 6, durationMs: 6000 } }[difficulty]),
    [difficulty],
  );
  const grid = useMemo(() => makeGrid(size), [size]);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
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

  const onCell = (i: number) => {
    if (done) return;
    setDone(i === grid.diffIdx ? "success" : "fail");
  };

  const timePct = (remainingMs / durationMs) * 100;
  const cellSize = size === 4 ? 56 : size === 5 ? 46 : 38;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: size * cellSize + 40 }}>
      <div className="typo-caption tabular-nums" style={{ color: GB.lightest }}>
        {t("uphero.mini.diff.header", { time: (remainingMs / 1000).toFixed(1) })}
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: GB.dark }} aria-hidden="true">
        <div style={{ width: `${timePct}%`, height: "100%", background: timePct > 40 ? GB.light : "#e88b7a" }} />
      </div>
      <div className="typo-caption" style={{ color: GB.light }}>
        {t("uphero.mini.diff.hint")}
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${size}, ${cellSize}px)`,
        }}
      >
        {grid.base.map((sym, i) => {
          const shown = i === grid.diffIdx ? grid.altSym : sym;
          const highlight = done && i === grid.diffIdx;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCell(i)}
              disabled={!!done}
              className="diff-cell rounded flex items-center justify-center"
              style={{
                width: cellSize,
                height: cellSize,
                background: highlight ? `${GB.lightest}55` : `${GB.light}22`,
                color: GB.lightest,
                border: `1px solid ${highlight ? GB.lightest : GB.dark}`,
                fontSize: Math.floor(cellSize * 0.6),
              }}
              aria-label={t("uphero.mini.diff.cellAria", { n: i + 1 })}
            >
              {shown}
            </button>
          );
        })}
      </div>
      {done && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{ color: done === "success" ? GB.lightest : "#e88b7a", fontWeight: 600 }}
        >
          {done === "success" ? t("uphero.mini.diff.success") : t("uphero.mini.diff.fail")}
        </div>
      )}
      {!done && (
        <button
          type="button"
          onClick={onCancel}
          className="typo-caption rounded px-3 py-1"
          style={{ color: GB.light, border: `1px solid ${GB.dark}`, background: "transparent" }}
          aria-label={t("uphero.mini.giveUpAria")}
        >
          {t("uphero.mini.giveUpLabel")}
        </button>
      )}
      <style jsx>{`
        .diff-cell {
          transition: transform 80ms ${EASE_OUT}, background 180ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .diff-cell:not(:disabled):active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
}
