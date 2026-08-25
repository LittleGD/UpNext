"use client";

/**
 * SortItems (재구성: Color Match).
 *
 * 화면 중앙에 타겟 색상 원이 표시되고, 아래 4 개 버튼 중 같은 색을 탭한다.
 * 매 라운드 색상이 무작위로 바뀌고, 정해진 횟수를 시간 안에 맞추면 성공.
 *
 * difficulty:
 *   - 1: 4 라운드 / 8s
 *   - 2: 6 라운드 / 9s
 *   - 3: 8 라운드 / 10s
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, GB_DANGER, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, MinigameHint, TimeBar, ProgressBar, StatusMessage, GiveUpButton } from "./_chrome";

interface Swatch {
  id: string;
  color: string;
  labelKey: "uphero.mini.sort.color.red" | "uphero.mini.sort.color.yellow" | "uphero.mini.sort.color.green" | "uphero.mini.sort.color.blue";
}

const SWATCHES: Swatch[] = [
  { id: "red", color: "#e88b7a", labelKey: "uphero.mini.sort.color.red" },
  { id: "yellow", color: "#e8d88b", labelKey: "uphero.mini.sort.color.yellow" },
  { id: "green", color: "#9bd28b", labelKey: "uphero.mini.sort.color.green" },
  { id: "blue", color: "#8bb6e8", labelKey: "uphero.mini.sort.color.blue" },
];

function pickTarget(): Swatch {
  return SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
}

export default function SortItems({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const { rounds, timeMs } = useMemo(() => {
    switch (difficulty) {
      case 1: return { rounds: 4, timeMs: 8000 };
      case 2: return { rounds: 6, timeMs: 9000 };
      case 3: return { rounds: 8, timeMs: 10000 };
    }
  }, [difficulty]);

  const [target, setTarget] = useState<Swatch>(() => pickTarget());
  const [done, setDone] = useState(0);
  const [remainingMs, setRemainingMs] = useState(timeMs);
  const [result, setResult] = useState<"success" | "fail" | null>(null);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    // render 중 ref 쓰기 금지 (react-hooks/refs) — 읽는 곳이 타이머 콜백뿐이라 commit 후 갱신로 충분
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (result) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, timeMs - (now - start));
      setRemainingMs(left);
      if (left <= 0) {
        setResult((prev) => prev ?? "fail");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeMs, result]);

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

  const tap = (s: Swatch) => {
    if (result) return;
    if (s.id === target.id) {
      const nextDone = done + 1;
      setDone(nextDone);
      setFlash("hit");
      window.setTimeout(() => setFlash(null), 120);
      if (nextDone >= rounds) {
        setResult("success");
        return;
      }
      let nxt = pickTarget();
      while (nxt.id === target.id) nxt = pickTarget();
      setTarget(nxt);
    } else {
      setFlash("miss");
      window.setTimeout(() => setFlash(null), 140);
      setResult("fail");
    }
  };

  const timePct = (remainingMs / timeMs) * 100;
  const donePct = (done / rounds) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 280 }}>
      <MinigameHeader>
        {t("uphero.mini.sort.header", { time: (remainingMs / 1000).toFixed(1), done, total: rounds })}
      </MinigameHeader>
      <TimeBar pct={timePct} />
      <MinigameHint>{t("uphero.mini.sort.hint")}</MinigameHint>
      <div
        className="color-target flex items-center justify-center"
        aria-label={t("uphero.mini.sort.targetAria", { label: t(target.labelKey) })}
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: target.color,
          border: `3px solid ${flash === "hit" ? GB.lightest : flash === "miss" ? GB_DANGER : GB.dark}`,
          color: GB.darkest,
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "0.05em",
        }}
      >
        {t(target.labelKey)}
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ width: 200 }}>
        {SWATCHES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => tap(s)}
            disabled={!!result}
            className="swatch-btn rounded flex items-center justify-center"
            style={{
              height: 60,
              background: s.color,
              border: `2px solid ${GB.dark}`,
              cursor: result ? "default" : "pointer",
              color: GB.darkest,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
            aria-label={t("uphero.mini.sort.swatchAria", { label: t(s.labelKey) })}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>
      <ProgressBar pct={donePct} />
      {result && (
        <StatusMessage kind={result}>
          {result === "success" ? t("uphero.mini.sort.success") : t("uphero.mini.sort.fail")}
        </StatusMessage>
      )}
      {!result && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .color-target {
          transition: border-color 120ms ${EASE_OUT}, transform 180ms ${EASE_OUT};
        }
        .swatch-btn {
          transition: transform 80ms ${EASE_OUT}, box-shadow 120ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
        }
        .swatch-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .swatch-btn:hover:not(:disabled) {
            box-shadow: 0 0 0 2px ${GB.lightest}66;
          }
        }
        .swatch-btn:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .color-target,
          .swatch-btn {
            transition: none;
          }
          .swatch-btn:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
