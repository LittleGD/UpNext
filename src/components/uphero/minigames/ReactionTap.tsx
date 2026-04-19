"use client";

/**
 * Phase 15 WarioWare — ReactionTap.
 *
 * 신호등 게임: 빨강 → 노랑 → 초록. 초록 켜지면 즉시 탭.
 *   초록 이전 탭 = 조급함 실패. 초록 이후 window 초과 = 느림 실패.
 *   diff 1: 600ms window / 2: 450ms / 3: 320ms.
 *   빨강 유지 시간은 랜덤 (1.2–2.6s) — 조급함 유발.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

type Phase = "red" | "yellow" | "green" | "done";

export default function ReactionTap({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const windowMs = useMemo(() => ({ 1: 600, 2: 450, 3: 320 }[difficulty]), [difficulty]);
  const [phase, setPhase] = useState<Phase>("red");
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const [reactionMs, setReactionMs] = useState<number | null>(null);
  const [failReason, setFailReason] = useState<"early" | "slow" | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const greenAtRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    // 신호 진행: red (1.2–2.6s) → yellow (500ms) → green
    const redDuration = 1200 + Math.random() * 1400;
    const t1 = window.setTimeout(() => {
      setPhase("yellow");
      const t2 = window.setTimeout(() => {
        setPhase("green");
        greenAtRef.current = performance.now();
        const t3 = window.setTimeout(() => {
          setPhase((prev) => {
            if (prev !== "green") return prev;
            setDone((d) => d ?? "fail");
            setFailReason((r) => r ?? "slow");
            return "done";
          });
        }, windowMs);
        timersRef.current.push(t3);
      }, 500);
      timersRef.current.push(t2);
    }, redDuration);
    timersRef.current.push(t1);
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [windowMs]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(
      () => onCompleteRef.current({ success: done === "success", score: reactionMs ?? 0 }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done, reactionMs]);

  const onTap = () => {
    if (done) return;
    if (phase === "green") {
      const rt = Math.round(performance.now() - (greenAtRef.current ?? performance.now()));
      setReactionMs(rt);
      setDone("success");
      setPhase("done");
    } else if (phase === "red" || phase === "yellow") {
      setDone("fail");
      setFailReason("early");
      setPhase("done");
    }
  };

  const color =
    done === "success" || phase === "green"
      ? "#7bc47f"
      : phase === "yellow"
        ? "#e5c454"
        : "#c44a4a";
  const label =
    done === "success"
      ? t("uphero.mini.reaction.success", { ms: reactionMs ?? 0 })
      : done === "fail"
        ? failReason === "early"
          ? t("uphero.mini.reaction.failEarly")
          : t("uphero.mini.reaction.failSlow")
        : phase === "green"
          ? t("uphero.mini.reaction.now")
          : phase === "yellow"
            ? t("uphero.mini.reaction.ready")
            : t("uphero.mini.reaction.wait");

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: 300 }}>
      <div className="typo-caption" style={{ color: GB.lightest }}>
        {t("uphero.mini.reaction.header", { ms: windowMs })}
      </div>
      <div className="typo-caption" style={{ color: GB.light }}>
        {t("uphero.mini.reaction.hint")}
      </div>
      <button
        type="button"
        onPointerDown={onTap}
        disabled={!!done}
        className="reaction-btn rounded-full flex items-center justify-center"
        style={{
          width: 200,
          height: 200,
          background: color,
          border: `3px solid ${phase === "green" ? GB.lightest : GB.dark}`,
          color: GB.darkest,
          fontSize: 20,
          fontWeight: 700,
          boxShadow: phase === "green" ? `0 0 24px ${GB.lightest}88` : undefined,
        }}
        aria-label={t("uphero.mini.reaction.btnAria", { phase })}
      >
        {done === "success" ? "✓" : done === "fail" ? "✗" : phase === "green" ? "●" : phase === "yellow" ? "◐" : "○"}
      </button>
      <div
        role="status"
        aria-live="assertive"
        className="typo-body tabular-nums"
        style={{ color: done === "fail" ? "#e88b7a" : GB.lightest, fontWeight: 600, minHeight: "1.5em" }}
      >
        {label}
      </div>
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
        .reaction-btn {
          transition: background 120ms ${EASE_OUT}, box-shadow 120ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
        }
        .reaction-btn:not(:disabled):active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}
