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
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, TimeBar, StatusMessage, GiveUpButton } from "./_chrome";

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
  const { t } = useTranslation();
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

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!done) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const tt = window.setTimeout(() => {
      onCompleteRef.current({ success: done === "success" });
    }, 700);
    return () => window.clearTimeout(tt);
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
        setTimeout(() => {
          setDeck((d) =>
            d.map((c, i) =>
              i === a || i === b ? { ...c, matched: true } : c,
            ),
          );
          setSelected([]);
          const allMatched = newDeck.every(
            (c, i) => c.matched || i === a || i === b,
          );
          if (allMatched) setDone("success");
        }, 400);
      } else {
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
      <MinigameHeader>
        {t("uphero.mini.pair.header", { time: (remainingMs / 1000).toFixed(1) })}
      </MinigameHeader>
      <TimeBar pct={timePct} />
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
              aria-label={shown ? t("uphero.mini.pair.cardAria", { symbol: card.symbol }) : t("uphero.mini.pair.cardCoveredAria")}
              className={`pair-card rounded ${shown ? "is-shown" : ""} ${card.matched ? "is-matched" : ""}`}
              style={{
                width: 56,
                height: 56,
                cursor: shown || done ? "default" : "pointer",
              }}
              disabled={shown || !!done}
            >
              <div className="pair-card-inner">
                <div className="pair-card-face pair-card-front">?</div>
                <div className="pair-card-face pair-card-back">{card.symbol}</div>
              </div>
            </button>
          );
        })}
      </div>
      {done && (
        <StatusMessage kind={done}>
          {done === "success" ? t("uphero.mini.pair.success") : t("uphero.mini.pair.fail")}
        </StatusMessage>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .pair-card {
          background: transparent;
          border: 0;
          padding: 0;
          perspective: 600px;
          transition: transform 120ms ${EASE_OUT};
        }
        .pair-card:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        .pair-card:not(:disabled):active {
          transform: scale(0.97);
        }
        .pair-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 320ms ${EASE_OUT};
        }
        .pair-card.is-shown .pair-card-inner {
          transform: rotateY(180deg);
        }
        .pair-card-face {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          border-radius: 6px;
          color: ${GB.lightest};
          font-size: 24px;
        }
        .pair-card-front {
          background: ${GB.dark};
          border: 1px solid ${GB.light};
        }
        .pair-card-back {
          background: ${GB.lightest}55;
          border: 1px solid ${GB.lightest};
          transform: rotateY(180deg);
        }
        .pair-card.is-matched .pair-card-back {
          background: ${GB.lightest}33;
          opacity: 0.55;
        }
        @media (prefers-reduced-motion: reduce) {
          .pair-card,
          .pair-card-inner {
            transition: none;
          }
          .pair-card:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
