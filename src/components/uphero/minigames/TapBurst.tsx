"use client";

/**
 * Phase 15 WarioWare — TapBurst.
 *
 * 3 초 안에 목표 횟수 이상 탭. 단일 동사("TAP!") + 단일 인풋.
 *   diff 1: 15 / 2: 20 / 3: 25 탭.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

const DURATION_MS = 3000;

export default function TapBurst({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const target = useMemo(() => ({ 1: 15, 2: 20, 3: 25 }[difficulty]), [difficulty]);
  const [count, setCount] = useState(0);
  const [remainingMs, setRemainingMs] = useState(DURATION_MS);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (done) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, DURATION_MS - (now - start));
      setRemainingMs(left);
      if (left <= 0) {
        setDone((prev) => prev ?? "fail");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(
      () => onCompleteRef.current({ success: done === "success", score: count }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done, count]);

  const onTap = () => {
    if (done) return;
    setCount((c) => {
      const next = c + 1;
      if (next >= target) setDone("success");
      return next;
    });
  };

  const timePct = (remainingMs / DURATION_MS) * 100;
  const countPct = Math.min(100, (count / target) * 100);

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 280 }}>
      <div className="typo-caption tabular-nums" style={{ color: GB.lightest }}>
        {t("uphero.mini.tap.header", { time: (remainingMs / 1000).toFixed(1), count, target })}
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: GB.dark }} aria-hidden="true">
        <div
          style={{
            width: `${timePct}%`,
            height: "100%",
            background: timePct > 40 ? GB.light : "#e88b7a",
            transition: `background 180ms ${EASE_OUT}`,
          }}
        />
      </div>
      <button
        type="button"
        onClick={onTap}
        disabled={!!done}
        className="tap-burst-btn rounded-full flex items-center justify-center"
        style={{
          width: 200,
          height: 200,
          background: done === "success" ? `${GB.lightest}55` : done === "fail" ? "#5a2a2a" : `${GB.light}33`,
          border: `2px solid ${done === "fail" ? "#e88b7a" : GB.lightest}`,
          color: GB.lightest,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "0.1em",
        }}
        aria-label={t("uphero.mini.tap.btnAria", { count, target })}
      >
        {done === "success" ? "✓" : done === "fail" ? "✗" : "TAP!"}
      </button>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: GB.dark }} aria-hidden="true">
        <div style={{ width: `${countPct}%`, height: "100%", background: GB.lightest }} />
      </div>
      {done && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{ color: done === "success" ? GB.lightest : "#e88b7a", fontWeight: 600 }}
        >
          {done === "success" ? t("uphero.mini.tap.success") : t("uphero.mini.tap.fail")}
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
        .tap-burst-btn {
          transition: transform 60ms ${EASE_OUT}, background 200ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
        }
        .tap-burst-btn:not(:disabled):active {
          transform: scale(0.94);
        }
      `}</style>
    </div>
  );
}
