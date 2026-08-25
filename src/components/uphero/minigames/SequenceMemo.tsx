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
 * 중단은 실패. 색맹 보조 — 각 셀에 1–4 번호 라벨.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, StatusMessage, GiveUpButton } from "./_chrome";

type Color = 0 | 1 | 2 | 3;
const COLOR_PALETTE: Record<Color, string> = {
  0: "#e88b7a", // red
  1: "#8bb9e8", // blue
  2: "#cdb887", // gold
  3: "#87c87a", // green
};
const COLOR_NAME_KEYS: Record<Color, "uphero.mini.seq.color.red" | "uphero.mini.seq.color.blue" | "uphero.mini.seq.color.yellow" | "uphero.mini.seq.color.green"> = {
  0: "uphero.mini.seq.color.red",
  1: "uphero.mini.seq.color.blue",
  2: "uphero.mini.seq.color.yellow",
  3: "uphero.mini.seq.color.green",
};

// 시퀀스 생성 — 렌더 밖 모듈 함수 (react-hooks/purity: 렌더 스코프 직접 Math.random 금지)
function makeSequence(length: number): Color[] {
  const arr: Color[] = [];
  for (let i = 0; i < length; i++) {
    arr.push(Math.floor(Math.random() * 4) as Color);
  }
  return arr;
}

export default function SequenceMemo({
  difficulty,
  onComplete,
  onCancel,
}: MinigameProps) {
  const { t } = useTranslation();
  const length = difficulty + 2;
  const sequence = useMemo<Color[]>(() => makeSequence(length), [length]);

  const [phase, setPhase] = useState<"watch" | "input" | "done">("watch");
  const [watchIdx, setWatchIdx] = useState(-1);
  const [inputIdx, setInputIdx] = useState(0);
  const [lastPressed, setLastPressed] = useState<Color | null>(null);
  const [result, setResult] = useState<"success" | "fail" | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    // render 중 ref 쓰기 금지 (react-hooks/refs) — 읽는 곳이 타이머 콜백뿐이라 commit 후 갱신로 충분
    onCompleteRef.current = onComplete;
  });

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

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!result) return;
    if (reportedRef.current) return;
    reportedRef.current = true;
    const tt = window.setTimeout(() => {
      onCompleteRef.current({ success: result === "success" });
    }, 800);
    return () => window.clearTimeout(tt);
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
      <MinigameHeader>
        {phase === "watch"
          ? t("uphero.mini.seq.header.watch")
          : phase === "input"
            ? t("uphero.mini.seq.header.input", {
                index: inputIdx,
                total: sequence.length,
              })
            : ""}
      </MinigameHeader>
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
              aria-label={t(COLOR_NAME_KEYS[c])}
              className="seq-btn rounded flex items-center justify-center"
              style={{
                width: 80,
                height: 80,
                background: isActive ? COLOR_PALETTE[c] : `${COLOR_PALETTE[c]}44`,
                border: `2px solid ${COLOR_PALETTE[c]}`,
                cursor:
                  phase === "input" && !result ? "pointer" : "default",
                color: GB.darkest,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              {/* 색맹 보조 — 1..4 번호 라벨 */}
              {c + 1}
            </button>
          );
        })}
      </div>
      {result && (
        <StatusMessage kind={result}>
          {result === "success" ? t("uphero.mini.seq.success") : t("uphero.mini.seq.fail")}
        </StatusMessage>
      )}
      {!result && phase === "input" && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .seq-btn {
          transition: background 180ms ${EASE_OUT}, transform 100ms ${EASE_OUT};
        }
        .seq-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        .seq-btn:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .seq-btn {
            transition: none;
          }
          .seq-btn:not(:disabled):active {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
