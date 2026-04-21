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
import {
  MinigameHeader,
  MinigameHint,
  StatusMessage,
  GiveUpButton,
  ResultIcon,
  MinigameShell,
  MinigameLiveText,
  SignalIcon,
} from "./_chrome";

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

  // Space/Enter 키로도 탭
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
  }, [done, phase]);

  // Phase 16 U2 — 신호등 색을 시그널 토큰으로 승격. red 는 GB.darkest 글리프와
  // 대비 충족을 위해 `-strong` 변종 사용 (#e85a5a, 4.93:1 vs darkest).
  const color =
    done === "success" || phase === "green"
      ? "var(--signal-go)"
      : phase === "yellow"
        ? "var(--signal-ready)"
        : "var(--signal-stop-strong)";
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
    <MinigameShell>
      <MinigameHeader tabular={false}>
        {t("uphero.mini.reaction.header", { ms: windowMs })}
      </MinigameHeader>
      <MinigameHint>{t("uphero.mini.reaction.hint")}</MinigameHint>
      <button
        type="button"
        onPointerDown={onTap}
        disabled={!!done}
        className={`reaction-btn rounded-full flex items-center justify-center ${done ? "mg-disabled" : ""}`}
        style={{
          /* Phase 16 R8 — 반응형 사이즈 토큰 */
          width: "var(--mg-hero-btn-size)",
          height: "var(--mg-hero-btn-size)",
          background: color,
          border: `3px solid ${phase === "green" ? GB.lightest : GB.dark}`,
          color: GB.darkest,
          fontSize: 20,
          fontWeight: 700,
          /* Phase 16 R12 — boxShadow 를 항상 정의된 값으로 유지 (off = transparent).
             undefined 와 값 사이 전환은 일부 브라우저서 즉시 스냅 → "green go!"
             전환의 가장 중요한 frame 이 죽는다. */
          boxShadow:
            phase === "green"
              ? "var(--glow-mg-signal-go)"
              : "var(--glow-mg-signal-go-off)",
        }}
        aria-label={t("uphero.mini.reaction.btnAria", { phase })}
      >
        {/* Phase 16 U1 — ●/◐/○ 유니코드 글리프를 SignalIcon SVG primitive 로
             교체. 폰트 폴백 / 픽셀 정렬 / 크기 일관성 확보. */}
        {done === "success" ? (
          <ResultIcon kind="success" size={64} color={GB.darkest} />
        ) : done === "fail" ? (
          <ResultIcon kind="fail" size={64} color={GB.darkest} />
        ) : (
          <SignalIcon
            kind={phase === "green" ? "go" : phase === "yellow" ? "ready" : "stop"}
            size={64}
            color={GB.darkest}
          />
        )}
      </button>
      {done ? (
        <StatusMessage kind={done}>{label}</StatusMessage>
      ) : (
        /* Phase 16 R6 — MinigameLiveText primitive 로 교체 (StatusMessage 이중화 해소) */
        <MinigameLiveText>{label}</MinigameLiveText>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        /* Phase 16 R11 — border-color 도 transition 목록에 포함 */
        .reaction-btn {
          transition:
            background 120ms ${EASE_OUT},
            box-shadow 120ms ${EASE_OUT},
            border-color 120ms ${EASE_OUT},
            transform 80ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
        }
        .reaction-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 4px;
        }
        /* Phase 16 U3 — 데스크톱 hover state */
        @media (hover: hover) and (pointer: fine) {
          .reaction-btn:not(:disabled):hover {
            transform: scale(1.02);
            filter: brightness(1.08);
          }
        }
        .reaction-btn:not(:disabled):active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .reaction-btn {
            transition: none;
          }
          .reaction-btn:not(:disabled):active,
          .reaction-btn:not(:disabled):hover {
            transform: none;
            filter: none;
          }
        }
      `}</style>
    </MinigameShell>
  );
}
