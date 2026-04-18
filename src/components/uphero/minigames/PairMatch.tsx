"use client";

/**
 * Phase 12e — PairMatch 미니게임.
 *
 * 작은 그리드 (3x2 / 4x2 / 4x3) 에 짝 있는 카드를 뒤집어 놓고,
 * 제한 시간 내 모든 짝을 맞추면 성공.
 *
 * - difficulty 1: 6 카드 (3 짝), 20 초
 * - difficulty 2: 8 카드 (4 짝), 18 초
 * - difficulty 3: 12 카드 (6 짝), 20 초
 *
 * UX:
 * - 탭 → 뒤집기 → 두 번째 탭 시 매칭 확인, 다르면 600ms 후 다시 가림
 * - 모든 짝 맞추면 성공, 타이머 0 → 실패
 * - 중단 (Esc / X) 은 실패 처리
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";

interface Card {
  id: number;
  symbol: string;
  matched: boolean;
  flipped: boolean;
}

const SYMBOL_POOL = ["◆", "●", "■", "▲", "★", "♥", "☀", "♪", "⚑", "⚒"];

function makeDeck(pairs: number): Card[] {
  const chosen = SYMBOL_POOL.slice(0, pairs);
  const dup = [...chosen, ...chosen].map((sym, i) => ({
    id: i,
    symbol: sym,
    matched: false,
    flipped: false,
  }));
  // shuffle
  for (let i = dup.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dup[i], dup[j]] = [dup[j], dup[i]];
  }
  return dup;
}

export default function PairMatch({
  difficulty,
  onComplete,
  onCancel,
}: MinigameProps) {
  const config = useMemo(() => {
    switch (difficulty) {
      case 1: return { pairs: 3, cols: 3, timeMs: 20000 };
      case 2: return { pairs: 4, cols: 4, timeMs: 18000 };
      case 3: return { pairs: 6, cols: 4, timeMs: 20000 };
    }
  }, [difficulty]);

  const [deck, setDeck] = useState<Card[]>(() => makeDeck(config.pairs));
  const [selected, setSelected] = useState<number[]>([]);
  const [remainingMs, setRemainingMs] = useState(config.timeMs);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const doneRef = useRef<"success" | "fail" | null>(null);
  doneRef.current = done;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Timer
  useEffect(() => {
    if (done) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const left = Math.max(0, config.timeMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        setDone("fail");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [config.timeMs, done]);

  // Done → onComplete 콜백 (한 번만)
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!done) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const t = window.setTimeout(() => {
      onCompleteRef.current({ success: done === "success" });
    }, 700);
    return () => window.clearTimeout(t);
  }, [done]);

  const onCardTap = (idx: number) => {
    if (done) return;
    if (deck[idx].flipped || deck[idx].matched) return;
    if (selected.length >= 2) return;

    const newDeck = deck.map((c, i) =>
      i === idx ? { ...c, flipped: true } : c,
    );
    setDeck(newDeck);
    const newSelected = [...selected, idx];
    setSelected(newSelected);

    if (newSelected.length === 2) {
      const [a, b] = newSelected;
      if (newDeck[a].symbol === newDeck[b].symbol) {
        // 매칭 성공 — 잠시 후 matched 처리
        setTimeout(() => {
          setDeck((d) =>
            d.map((c, i) =>
              i === a || i === b ? { ...c, matched: true } : c,
            ),
          );
          setSelected([]);
          // 전체 매칭 체크
          const allMatched = newDeck.every(
            (c, i) => c.matched || i === a || i === b,
          );
          if (allMatched) setDone("success");
        }, 400);
      } else {
        // 불일치 — 600ms 후 다시 가림
        setTimeout(() => {
          setDeck((d) =>
            d.map((c, i) =>
              i === a || i === b ? { ...c, flipped: false } : c,
            ),
          );
          setSelected([]);
        }, 600);
      }
    }
  };

  const timePct = (remainingMs / config.timeMs) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div
        className="typo-caption tabular-nums"
        style={{ color: GB.lightest }}
      >
        짝 맞추기 · {(remainingMs / 1000).toFixed(1)}s
      </div>
      {/* 타이머 bar */}
      <div
        className="w-full max-w-xs h-1 rounded-full overflow-hidden"
        style={{ background: GB.dark }}
        aria-hidden="true"
      >
        <div
          style={{
            width: `${timePct}%`,
            height: "100%",
            background:
              timePct > 50 ? GB.light : timePct > 20 ? "#e8d88b" : "#e88b7a",
            transition: `background 240ms ${EASE_OUT}`,
          }}
        />
      </div>
      {/* 카드 grid */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
          maxWidth: 280,
        }}
      >
        {deck.map((card, idx) => {
          const shown = card.flipped || card.matched;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onCardTap(idx)}
              aria-label={shown ? `${card.symbol}` : "카드 (덮어짐)"}
              className="pair-card rounded flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                background: shown
                  ? card.matched
                    ? `${GB.lightest}33`
                    : `${GB.lightest}55`
                  : GB.dark,
                color: GB.lightest,
                border: `1px solid ${card.matched ? GB.lightest : GB.light}`,
                fontSize: 24,
                opacity: card.matched ? 0.55 : 1,
                cursor: shown || done ? "default" : "pointer",
              }}
              disabled={shown || !!done}
            >
              {shown ? card.symbol : "?"}
            </button>
          );
        })}
      </div>
      {/* 하단 상태 */}
      {done && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{
            color: done === "success" ? GB.lightest : "#e88b7a",
            fontWeight: 600,
          }}
        >
          {done === "success" ? "성공!" : "실패"}
        </div>
      )}
      {!done && (
        <button
          type="button"
          onClick={onCancel}
          className="typo-caption mt-1 rounded px-3 py-1"
          style={{
            background: "transparent",
            color: GB.light,
            border: `1px solid ${GB.dark}`,
          }}
          aria-label="미니게임 포기"
        >
          포기
        </button>
      )}
      <style jsx>{`
        .pair-card {
          transition: transform 120ms ${EASE_OUT}, background 180ms ${EASE_OUT};
        }
        .pair-card:not(:disabled):active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
}
