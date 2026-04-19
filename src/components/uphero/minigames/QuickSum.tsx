"use client";

/**
 * Phase 15 WarioWare — QuickSum.
 *
 * 8 초 안에 덧셈/뺄셈 문제를 diff 에 맞는 개수만큼 맞추기.
 *   diff 1: 3 문제 / 2: 4 문제 / 3: 5 문제. 4 지선다, 오답 즉시 실패.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, GB_DANGER, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, TimeBar, StatusMessage, GiveUpButton, ResultIcon } from "./_chrome";

const DURATION_MS = 8000;

interface Problem {
  text: string;
  answer: number;
  choices: number[];
}

function makeProblem(diff: 1 | 2 | 3): Problem {
  const range = diff === 1 ? 9 : diff === 2 ? 15 : 25;
  const op = Math.random() < 0.5 ? "+" : "-";
  const a = 1 + Math.floor(Math.random() * range);
  const b = 1 + Math.floor(Math.random() * range);
  const [x, y] = op === "-" && a < b ? [b, a] : [a, b];
  const answer = op === "+" ? x + y : x - y;
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < 4 && guard++ < 50) {
    const delta = (Math.floor(Math.random() * 12) - 6) || 1;
    const cand = answer + delta;
    if (cand >= 0 && cand !== answer) set.add(cand);
  }
  let fallback = 0;
  while (set.size < 4) set.add(fallback++);
  const choices = [...set];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { text: `${x} ${op} ${y}`, answer, choices };
}

export default function QuickSum({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const target = useMemo(() => ({ 1: 3, 2: 4, 3: 5 }[difficulty]), [difficulty]);
  const [problem, setProblem] = useState<Problem>(() => makeProblem(difficulty));
  const [solved, setSolved] = useState(0);
  const [remainingMs, setRemainingMs] = useState(DURATION_MS);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const [problemKey, setProblemKey] = useState(0);
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
      () => onCompleteRef.current({ success: done === "success", score: solved }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done, solved]);

  const choose = (n: number) => {
    if (done) return;
    if (n !== problem.answer) {
      setDone("fail");
      return;
    }
    const next = solved + 1;
    setSolved(next);
    if (next >= target) {
      setDone("success");
      return;
    }
    setProblem(makeProblem(difficulty));
    setProblemKey((k) => k + 1);
  };

  const timePct = (remainingMs / DURATION_MS) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 280 }}>
      <MinigameHeader>
        {t("uphero.mini.sum.header", { time: (remainingMs / 1000).toFixed(1), done: solved, total: target })}
      </MinigameHeader>
      <TimeBar pct={timePct} maxWidthClass="" />
      <div
        key={problemKey}
        className="quicksum-problem rounded px-6 py-4 typo-body tabular-nums"
        style={{
          fontSize: 36,
          color: GB.lightest,
          background: `${GB.light}22`,
          border: `1px solid ${GB.lightest}`,
          letterSpacing: "0.1em",
        }}
        aria-label={t("uphero.mini.sum.problemAria", { text: problem.text })}
      >
        {done === "fail" ? (
          <ResultIcon kind="fail" size={32} color={GB_DANGER} />
        ) : done === "success" ? (
          <ResultIcon kind="success" size={32} color={GB.lightest} />
        ) : (
          `${problem.text} = ?`
        )}
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ maxWidth: 260 }}>
        {problem.choices.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => choose(n)}
            disabled={!!done}
            className="sum-btn rounded typo-body tabular-nums"
            style={{
              width: 120,
              height: 56,
              fontSize: 22,
              background: `${GB.light}22`,
              color: GB.lightest,
              border: `1px solid ${GB.light}`,
            }}
            aria-label={t("uphero.mini.sum.choiceAria", { n })}
          >
            {n}
          </button>
        ))}
      </div>
      {done && (
        <StatusMessage kind={done}>
          {done === "success" ? t("uphero.mini.sum.success") : t("uphero.mini.sum.fail")}
        </StatusMessage>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .quicksum-problem {
          animation: problemSwap 220ms ${EASE_OUT};
        }
        @keyframes problemSwap {
          0% { transform: scale(0.94); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .sum-btn {
          transition: transform 80ms ${EASE_OUT}, background 160ms ${EASE_OUT}, border-color 160ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .sum-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .sum-btn:hover:not(:disabled) {
            background: ${GB.light}44;
            border-color: ${GB.lightest};
          }
        }
        .sum-btn:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .quicksum-problem,
          .sum-btn {
            animation: none;
            transition: none;
          }
          .sum-btn:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
