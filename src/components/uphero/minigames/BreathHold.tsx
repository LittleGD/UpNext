"use client";

/**
 * Phase 15 WarioWare — BreathHold.
 *
 * 지정 시간 동안 버튼 롱프레스 유지. 중간에 떼면 실패.
 *   diff 1: 3s / 2: 4s / 3: 5s. touchend/mouseup 으로 즉시 판정.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

export default function BreathHold({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const targetMs = useMemo(() => ({ 1: 3000, 2: 4000, 3: 5000 }[difficulty]), [difficulty]);
  const [holding, setHolding] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const holdingRef = useRef(false);
  holdingRef.current = holding;
  const doneRef = useRef<"success" | "fail" | null>(null);
  doneRef.current = done;
  const progressRef = useRef(0);
  progressRef.current = progressMs;
  const reportedRef = useRef(false);

  const MAX_WAIT_MS = 15000;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDone((prev) => prev ?? "fail");
    }, MAX_WAIT_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (done) return;
    if (!holding) return;
    const start = performance.now();
    const startProgress = progressMs;
    let raf = 0;
    const tick = (now: number) => {
      if (!holdingRef.current) return;
      if (doneRef.current) return;
      const elapsed = now - start;
      const next = Math.min(targetMs, startProgress + elapsed);
      setProgressMs(next);
      if (next >= targetMs) {
        setDone((prev) => prev ?? "success");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding, done, targetMs]);

  useEffect(() => {
    if (!done) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const timer = window.setTimeout(
      () => onCompleteRef.current({ success: done === "success" }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done]);

  const startHold = () => {
    if (doneRef.current) return;
    setHolding(true);
  };
  const stopHold = () => {
    if (doneRef.current) return;
    if (!holdingRef.current) return;
    setHolding(false);
    // 떼자마자 fail — 단, progress 가 이미 목표치에 도달했으면 success 유지
    if (progressRef.current < targetMs) {
      setDone((prev) => prev ?? "fail");
    }
  };

  const pct = (progressMs / targetMs) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 280 }}>
      <div className="typo-caption tabular-nums" style={{ color: GB.lightest }}>
        {t("uphero.mini.breath.header", { left: ((targetMs - progressMs) / 1000).toFixed(1), total: (targetMs / 1000).toFixed(0) })}
      </div>
      <div className="typo-caption" style={{ color: GB.light }}>
        {t("uphero.mini.breath.hint")}
      </div>
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        disabled={!!done}
        className="breath-btn rounded-full flex items-center justify-center relative overflow-hidden"
        style={{
          width: 180,
          height: 180,
          background: done === "success" ? `${GB.lightest}55` : done === "fail" ? "#5a2a2a" : holding ? `${GB.light}44` : `${GB.light}22`,
          border: `2px solid ${holding ? GB.lightest : GB.light}`,
          color: GB.lightest,
          fontSize: 22,
          fontWeight: 600,
        }}
        aria-label={t("uphero.mini.breath.btnAria", { pct: Math.round(pct) })}
      >
        <span style={{ position: "relative", zIndex: 1 }}>
          {done === "success" ? "✓" : done === "fail" ? "✗" : holding ? t("uphero.mini.breath.holding") : t("uphero.mini.breath.press")}
        </span>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct}%`,
            background: `${GB.lightest}33`,
            transition: `height 60ms linear`,
          }}
        />
      </button>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: GB.dark }} aria-hidden="true">
        <div style={{ width: `${pct}%`, height: "100%", background: GB.lightest }} />
      </div>
      {done && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{ color: done === "success" ? GB.lightest : "#e88b7a", fontWeight: 600 }}
        >
          {done === "success" ? t("uphero.mini.breath.success") : t("uphero.mini.breath.fail")}
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
        .breath-btn {
          transition: transform 120ms ${EASE_OUT}, background 180ms ${EASE_OUT};
          touch-action: none;
          user-select: none;
        }
      `}</style>
    </div>
  );
}
