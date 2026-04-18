"use client";

/**
 * Phase 12e — SequenceMemo (Simon says) 미니게임.
 *
 * 4 개 색 버튼이 순서대로 깜빡인 뒤, 플레이어가 같은 순서로 누르면 성공.
 *
 * - difficulty 1: 시퀀스 3 단계
 * - difficulty 2: 시퀀스 4 단계
 * - difficulty 3: 시퀀스 5 단계
 *
 * Flow:
 *   (1) "watch" — 시퀀스를 순차 point (각 600ms, 간격 200ms)
 *   (2) "input" — 유저가 순서대로 4개 버튼 탭
 *   (3) 틀리면 즉시 실패, 끝까지 맞추면 성공
 *
 * 중단은 실패.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";

type Color = 0 | 1 | 2 | 3;
const COLOR_PALETTE: Record<Color, string> = {
  0: "#e88b7a", // red
  1: "#8bb9e8", // blue
  2: "#cdb887", // gold
  3: "#87c87a", // green
};
const COLOR_NAMES: Record<Color, string> = {
  0: "빨강",
  1: "파랑",
  2: "노랑",
  3: "초록",
};

export default function SequenceMemo({
  difficulty,
  onComplete,
  onCancel,
}: MinigameProps) {
  const length = difficulty + 2; // 3 / 4 / 5
  const sequence = useMemo<Color[]>(() => {
    const arr: Color[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(Math.floor(Math.random() * 4) as Color);
    }
    return arr;
  }, [length]);

  const [phase, setPhase] = useState<"watch" | "input" | "done">("watch");
  const [watchIdx, setWatchIdx] = useState(-1); // -1 = nothing highlighting
  const [inputIdx, setInputIdx] = useState(0);
  const [lastPressed, setLastPressed] = useState<Color | null>(null);
  const [result, setResult] = useState<"success" | "fail" | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // watch phase — 시퀀스 재생
  useEffect(() => {
    if (phase !== "watch") return;
    let cancelled = false;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 500));
      for (let i = 0; i < sequence.length; i++) {
        if (cancelled) return;
        setWatchIdx(i);
        await new Promise((r) => setTimeout(r, 500));
        setWatchIdx(-1);
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) setPhase("input");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [phase, sequence]);

  // done → onComplete
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!result) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const t = window.setTimeout(() => {
      onCompleteRef.current({ success: result === "success" });
    }, 800);
    return () => window.clearTimeout(t);
  }, [result]);

  const onPress = (c: Color) => {
    if (phase !== "input" || result) return;
    setLastPressed(c);
    setTimeout(() => setLastPressed(null), 220);
    if (c === sequence[inputIdx]) {
      const nextIdx = inputIdx + 1;
      if (nextIdx >= sequence.length) {
        setPhase("done");
        setResult("success");
      } else {
        setInputIdx(nextIdx);
      }
    } else {
      setPhase("done");
      setResult("fail");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div
        className="typo-caption tabular-nums"
        style={{ color: GB.lightest }}
      >
        시퀀스 기억 · {phase === "watch" ? "관찰" : phase === "input" ? `${inputIdx}/${sequence.length}` : ""}
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        {([0, 1, 2, 3] as Color[]).map((c) => {
          const isActive = (phase === "watch" && watchIdx >= 0 && sequence[watchIdx] === c) || lastPressed === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onPress(c)}
              disabled={phase !== "input" || !!result}
              aria-label={`${COLOR_NAMES[c]} 버튼`}
              className="seq-btn rounded"
              style={{
                width: 80,
                height: 80,
                background: isActive ? COLOR_PALETTE[c] : `${COLOR_PALETTE[c]}44`,
                border: `2px solid ${COLOR_PALETTE[c]}`,
                cursor:
                  phase === "input" && !result ? "pointer" : "default",
                transition: `background 180ms ${EASE_OUT}`,
              }}
            />
          );
        })}
      </div>
      {result && (
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{
            color: result === "success" ? GB.lightest : "#e88b7a",
            fontWeight: 600,
          }}
        >
          {result === "success" ? "성공!" : "순서가 틀렸다"}
        </div>
      )}
      {!result && phase === "input" && (
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
        .seq-btn:not(:disabled):active {
          transform: scale(0.94);
          transition: transform 100ms ${EASE_OUT};
        }
      `}</style>
    </div>
  );
}
