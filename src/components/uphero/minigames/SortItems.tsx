"use client";

/**
 * Phase 15 WarioWare — SortItems.
 *
 * 화면 중앙의 아이템을 좌/우 버킷 중 올바른 쪽으로 탭해 분류.
 *   diff 1: 5 / 2: 7 / 3: 9 아이템 연속 정답. 실수 한 번이면 즉시 실패.
 *   단일 인풋: 좌/우 버튼 탭.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

const DURATION_MS = 8000;

type Bucket = "L" | "R";
interface Item {
  symbol: string;
  answer: Bucket;
}

// 아이템 심볼 풀 — 좌 (식재료) / 우 (문구)
const POOL_L = ["🍎", "🍞", "🥕", "🧀", "🍇"];
const POOL_R = ["✎", "□", "◇", "✱", "⌘"];

function makeItems(n: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const left = Math.random() < 0.5;
    const pool = left ? POOL_L : POOL_R;
    items.push({ symbol: pool[Math.floor(Math.random() * pool.length)], answer: left ? "L" : "R" });
  }
  return items;
}

export default function SortItems({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const targetCount = useMemo(() => ({ 1: 5, 2: 7, 3: 9 }[difficulty]), [difficulty]);
  const [queue] = useState<Item[]>(() => makeItems(targetCount));
  const [idx, setIdx] = useState(0);
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
      () => onCompleteRef.current({ success: done === "success", score: idx }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done, idx]);

  const current = queue[idx];

  const choose = (pick: Bucket) => {
    if (done || !current) return;
    if (pick !== current.answer) {
      setDone("fail");
      return;
    }
    const next = idx + 1;
    setIdx(next);
    if (next >= queue.length) setDone("success");
  };

  const timePct = (remainingMs / DURATION_MS) * 100;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 300 }}>
      <div className="typo-caption tabular-nums" style={{ color: GB.lightest }}>
        {t("uphero.mini.sort.header", { time: (remainingMs / 1000).toFixed(1), done: idx, total: queue.length })}
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: GB.dark }} aria-hidden="true">
        <div style={{ width: `${timePct}%`, height: "100%", background: timePct > 40 ? GB.light : "#e88b7a" }} />
      </div>
      <div
        className="rounded flex items-center justify-center"
        style={{
          width: 120,
          height: 120,
          fontSize: 48,
          color: GB.lightest,
          background: `${GB.light}22`,
          border: `1px solid ${GB.lightest}`,
        }}
        aria-label={t("uphero.mini.sort.itemAria", { symbol: current?.symbol ?? "" })}
      >
        {done === "success" ? "✓" : done === "fail" ? "✗" : current?.symbol ?? ""}
      </div>
      <div className="typo-caption" style={{ color: GB.light }}>
        {t("uphero.mini.sort.hint")}
      </div>
      <div className="flex gap-4 w-full justify-center">
        <button
          type="button"
          onClick={() => choose("L")}
          disabled={!!done}
          className="sort-btn rounded typo-body flex flex-col items-center gap-1"
          style={{
            width: 120,
            height: 80,
            background: `${GB.light}22`,
            color: GB.lightest,
            border: `1px solid ${GB.light}`,
          }}
          aria-label={t("uphero.mini.sort.leftAria")}
        >
          <span style={{ fontSize: 22 }}>🍞</span>
          <span className="typo-micro" style={{ color: GB.lightest }}>{t("uphero.mini.sort.leftLabel")}</span>
        </button>
        <button
          type="button"
          onClick={() => choose("R")}
          disabled={!!done}
          className="sort-btn rounded typo-body flex flex-col items-center gap-1"
          style={{
            width: 120,
            height: 80,
            background: `${GB.light}22`,
            color: GB.lightest,
            border: `1px solid ${GB.light}`,
          }}
          aria-label={t("uphero.mini.sort.rightAria")}
        >
          <span style={{ fontSize: 22 }}>✎</span>
          <span className="typo-micro" style={{ color: GB.lightest }}>{t("uphero.mini.sort.rightLabel")}</span>
        </button>
      </div>
      {done && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{ color: done === "success" ? GB.lightest : "#e88b7a", fontWeight: 600 }}
        >
          {done === "success" ? t("uphero.mini.sort.success") : t("uphero.mini.sort.fail")}
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
        .sort-btn {
          transition: transform 80ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .sort-btn:not(:disabled):active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
}
