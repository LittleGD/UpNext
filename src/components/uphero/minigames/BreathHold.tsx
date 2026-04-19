"use client";

/**
 * BreathHold (재구성: Timing Stop).
 *
 * 가로 바 위를 좌우로 움직이는 커서를 STOP 버튼으로 정지시켜
 * 중앙 녹색 존 안에 멈추면 1 라운드 성공. 정해진 라운드 수를 채우면 클리어.
 *
 * difficulty:
 *   - 1: 2 라운드, zone 38%, 1.4s 왕복
 *   - 2: 3 라운드, zone 28%, 1.1s 왕복
 *   - 3: 4 라운드, zone 20%, 0.9s 왕복
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, GB_DANGER, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, MinigameHint, TimeBar, ProgressBar, StatusMessage, GiveUpButton } from "./_chrome";

const TIME_LIMIT_MS = 12000;

export default function BreathHold({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const cfg = useMemo(() => {
    switch (difficulty) {
      case 1: return { rounds: 2, zone: 0.38, sweepMs: 1400 };
      case 2: return { rounds: 3, zone: 0.28, sweepMs: 1100 };
      case 3: return { rounds: 4, zone: 0.20, sweepMs: 900 };
    }
  }, [difficulty]);

  const [done, setDone] = useState(0);
  const [cursorPct, setCursorPct] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [remainingMs, setRemainingMs] = useState(TIME_LIMIT_MS);
  const [result, setResult] = useState<"success" | "fail" | null>(null);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const startRef = useRef(performance.now());
  const sweepStartRef = useRef(performance.now());
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (result) return;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const left = Math.max(0, TIME_LIMIT_MS - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        setResult((prev) => prev ?? "fail");
        return;
      }
      if (!stoppedRef.current) {
        const tt = ((now - sweepStartRef.current) % cfg.sweepMs) / cfg.sweepMs;
        const pct = (tt < 0.5 ? tt * 2 : (1 - tt) * 2) * 100;
        setCursorPct(pct);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cfg.sweepMs, result]);

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!result) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const tt = window.setTimeout(() => {
      onCompleteRef.current({ success: result === "success", score: done });
    }, 700);
    return () => window.clearTimeout(tt);
  }, [result, done]);

  const stop = () => {
    if (result || stoppedRef.current) return;
    stoppedRef.current = true;
    setStopped(true);
    const zoneStart = (1 - cfg.zone) / 2 * 100;
    const zoneEnd = (1 + cfg.zone) / 2 * 100;
    const inZone = cursorPct >= zoneStart && cursorPct <= zoneEnd;
    if (inZone) {
      const nextDone = done + 1;
      setDone(nextDone);
      setFlash("hit");
      window.setTimeout(() => setFlash(null), 180);
      if (nextDone >= cfg.rounds) {
        setResult("success");
        return;
      }
      window.setTimeout(() => {
        sweepStartRef.current = performance.now();
        stoppedRef.current = false;
        setStopped(false);
      }, 350);
    } else {
      setFlash("miss");
      window.setTimeout(() => setFlash(null), 180);
      setResult("fail");
    }
  };

  // Space 키로 정지
  useEffect(() => {
    if (result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, cursorPct]);

  const timePct = (remainingMs / TIME_LIMIT_MS) * 100;
  const donePct = (done / cfg.rounds) * 100;
  const zoneStartPct = ((1 - cfg.zone) / 2) * 100;
  const zoneWidthPct = cfg.zone * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 280 }}>
      <MinigameHeader>
        {t("uphero.mini.breath.header", { left: (remainingMs / 1000).toFixed(1), total: cfg.rounds, done })}
      </MinigameHeader>
      <TimeBar pct={timePct} />
      <MinigameHint>{t("uphero.mini.breath.hint")}</MinigameHint>
      <div
        style={{
          position: "relative",
          width: 240,
          height: 28,
          background: GB.dark,
          border: `1px solid ${GB.light}`,
          borderRadius: 4,
          overflow: "hidden",
        }}
        aria-label={t("uphero.mini.breath.btnAria", { pct: Math.round(cursorPct) })}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${zoneStartPct}%`,
            top: 0,
            width: `${zoneWidthPct}%`,
            height: "100%",
            background: "#9bd28b55",
            borderLeft: `2px solid #9bd28b`,
            borderRight: `2px solid #9bd28b`,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `calc(${cursorPct}% - 3px)`,
            top: 0,
            width: 6,
            height: "100%",
            background:
              flash === "hit" ? "#9bd28b" : flash === "miss" ? GB_DANGER : GB.lightest,
            transition: stopped ? `background 120ms ${EASE_OUT}` : "none",
          }}
        />
      </div>
      <button
        type="button"
        onClick={stop}
        disabled={!!result || stopped}
        className="stop-btn rounded-full"
        style={{
          width: 140,
          height: 56,
          background: stopped ? `${GB.light}33` : `${GB.lightest}55`,
          border: `2px solid ${GB.lightest}`,
          color: GB.lightest,
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "0.15em",
          cursor: result || stopped ? "default" : "pointer",
        }}
        aria-label={t("uphero.mini.breath.press")}
      >
        STOP
      </button>
      <ProgressBar pct={donePct} />
      {result && (
        <StatusMessage kind={result}>
          {result === "success" ? t("uphero.mini.breath.success") : t("uphero.mini.breath.fail")}
        </StatusMessage>
      )}
      {!result && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .stop-btn {
          transition: transform 80ms ${EASE_OUT}, background 200ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
        }
        .stop-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 4px;
        }
        @media (hover: hover) and (pointer: fine) {
          .stop-btn:hover:not(:disabled) {
            background: ${GB.lightest}77;
          }
        }
        .stop-btn:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .stop-btn {
            transition: none;
          }
          .stop-btn:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
