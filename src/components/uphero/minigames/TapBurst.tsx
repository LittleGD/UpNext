"use client";

/**
 * Phase 15 WarioWare — TapBurst.
 *
 * 3 초 안에 목표 횟수 이상 탭. 단일 동사("TAP!") + 단일 인풋.
 *   diff 1: 13 / 2: 18 / 3: 23 탭.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, GB_DANGER, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import {
  MinigameHeader,
  TimeBar,
  ProgressBar,
  StatusMessage,
  GiveUpButton,
  ResultIcon,
} from "./_chrome";

const DURATION_MS = 3000;

export default function TapBurst({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const target = useMemo(() => ({ 1: 13, 2: 18, 3: 23 }[difficulty]), [difficulty]);
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

  // Space/Enter 키로도 탭 가능
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        onTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, target]);

  const timePct = (remainingMs / DURATION_MS) * 100;
  const countPct = Math.min(100, (count / target) * 100);

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 280 }}>
      <MinigameHeader>
        {t("uphero.mini.tap.header", { time: (remainingMs / 1000).toFixed(1), count, target })}
      </MinigameHeader>
      <TimeBar pct={timePct} maxWidthClass="" />
      <button
        type="button"
        onPointerDown={onTap}
        disabled={!!done}
        className="tap-burst-btn rounded-full flex items-center justify-center"
        style={{
          width: 200,
          height: 200,
          background: done === "success" ? `${GB.lightest}55` : done === "fail" ? "#5a2a2a" : `${GB.light}33`,
          border: `2px solid ${done === "fail" ? GB_DANGER : GB.lightest}`,
          color: GB.lightest,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "0.1em",
        }}
        aria-label={t("uphero.mini.tap.btnAria", { count, target })}
      >
        {done === "success" ? (
          <ResultIcon kind="success" size={64} color={GB.lightest} />
        ) : done === "fail" ? (
          <ResultIcon kind="fail" size={64} color={GB_DANGER} />
        ) : (
          "TAP!"
        )}
      </button>
      <ProgressBar pct={countPct} maxWidthClass="" />
      {done && (
        <StatusMessage kind={done}>
          {done === "success" ? t("uphero.mini.tap.success") : t("uphero.mini.tap.fail")}
        </StatusMessage>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .tap-burst-btn {
          transition: transform 60ms ${EASE_OUT}, background 200ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
        }
        .tap-burst-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 4px;
        }
        .tap-burst-btn:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .tap-burst-btn {
            transition: none;
          }
          .tap-burst-btn:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
