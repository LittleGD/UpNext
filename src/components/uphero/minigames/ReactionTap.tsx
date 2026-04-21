"use client";

/**
 * Phase 15 WarioWare — ReactionTap.
 *
 * 신호등 게임: 빨강 → 노랑 → 초록. 초록 켜지면 즉시 탭.
 *   초록 이전 탭 = 조급함 실패. 초록 이후 window 초과 = 느림 실패.
 *   diff 1: 600ms window / 2: 450ms / 3: 320ms.
 *   빨강 유지 시간은 랜덤 (1.2–2.6s) — 조급함 유발.
 *
 * Phase 16 design review 2차 — 이벤트연동 미니게임 종합 리뷰 반영:
 *   R1. 3단계 phase 를 2단계 시각 어휘(green vs not-green)로 납작화했던 문제 해소.
 *       red/yellow/green 각각 다른 border/glow 토큰 사용 (`--glow-mg-signal-ready`
 *       추가). data-phase attribute 로 상태 → CSS 위임.
 *   R2. 측정 공정성. 초록 점등 ~ 탭 구간(measuring)에서 `:active` transform 을
 *       제거해 페인트 비용이 반응 시간에 끼어들지 않도록. 색 전환 120→80ms.
 *   R3. 키보드 Space `repeat` 이벤트가 red/yellow 단계에서 조기 실패 유발하던
 *       문제 → `e.repeat` 가드.
 *   R4. aria-label 에 raw phase ("red") 원문 노출 → i18n 현지화된 상태어로 매핑.
 *   R5. 실패 사유에 ms 수치 추가 — "−120ms 조급" / "+600ms 지남" 로 학습 가능.
 *   R6. MinigameHeader tabular 활성화 (수치 포함 헤더는 기본 tabular).
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
  // R5 — 조기 실패 시 얼마나 빨랐는지 수치로 피드백. green 스케줄 시점을 기록해
  //   early tap 때 remaining = greenScheduledAt - now 로 계산.
  const [earlyDeltaMs, setEarlyDeltaMs] = useState<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const greenAtRef = useRef<number | null>(null);
  const greenScheduledAtRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const startedAt = performance.now();
    const redDuration = 1200 + Math.random() * 1400;
    // green 도착 예정 시각을 미리 기록 — early tap 시 remaining 계산용.
    greenScheduledAtRef.current = startedAt + redDuration + 500;
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
      // R2 방어적 정리 — 성공 탭 후 slow-fail 타이머가 여전히 살아있으면 state
      //   가드로 막히긴 하지만 timer 자체를 걷어두면 저사양 기기에서 프레임
      //   드롭 리스크가 사라진다.
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    } else if (phase === "red" || phase === "yellow") {
      // R5 — 얼마나 빨랐는지 계산. greenScheduledAt 은 useEffect 에서 세팅되어
      //   이 시점에 non-null 이 보장됨.
      const scheduled = greenScheduledAtRef.current;
      if (scheduled != null) {
        setEarlyDeltaMs(Math.max(0, Math.round(scheduled - performance.now())));
      }
      setDone("fail");
      setFailReason("early");
      setPhase("done");
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    }
  };

  // Space/Enter 키로도 탭. R3 — e.repeat 가드로 길게 누르기에 의한 조기 실패
  //   방지 (keydown 이 반복 발생하면서 red 단계에서 ‘조급함 실패’ 로 판정되는
  //   부당한 패턴).
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        onTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, phase]);

  const label =
    done === "success"
      ? t("uphero.mini.reaction.success", { ms: reactionMs ?? 0 })
      : done === "fail"
        ? failReason === "early"
          ? t("uphero.mini.reaction.failEarly", { ms: earlyDeltaMs ?? 0 })
          : t("uphero.mini.reaction.failSlow", { ms: windowMs })
        : phase === "green"
          ? t("uphero.mini.reaction.now")
          : phase === "yellow"
            ? t("uphero.mini.reaction.ready")
            : t("uphero.mini.reaction.wait");

  // R4 — phase 의 현지화된 자연어 표현. 스크린리더가 "red" 영문을 읽지 않도록.
  const phaseLabel =
    phase === "red"
      ? t("uphero.mini.reaction.phase.red")
      : phase === "yellow"
        ? t("uphero.mini.reaction.phase.yellow")
        : phase === "green"
          ? t("uphero.mini.reaction.phase.green")
          : t("uphero.mini.reaction.phase.done");

  return (
    <MinigameShell>
      {/* R6 — 수치 포함 헤더는 tabular 기본 */}
      <MinigameHeader tabular={true}>
        {t("uphero.mini.reaction.header", { ms: windowMs })}
      </MinigameHeader>
      <MinigameHint>{t("uphero.mini.reaction.hint")}</MinigameHint>
      <button
        type="button"
        onPointerDown={onTap}
        disabled={!!done}
        data-phase={phase}
        data-done={done ?? undefined}
        data-measuring={phase === "green" && !done ? "true" : undefined}
        className={`reaction-btn rounded-full flex items-center justify-center ${done ? "mg-disabled" : ""}`}
        style={{
          width: "var(--mg-hero-btn-size)",
          height: "var(--mg-hero-btn-size)",
          color: GB.darkest,
        }}
        aria-label={t("uphero.mini.reaction.btnAria", { phase: phaseLabel })}
      >
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
        <MinigameLiveText>{label}</MinigameLiveText>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        /* R1 — 3단계 phase 를 data-attribute 로 CSS 에 위임. 인라인 style 삼항
           중첩을 걷어내 상태 머신이 한 레이어(CSS selector) 로 집중된다. */
        .reaction-btn {
          /* R2 — 측정 공정성을 위해 색 전환 120→80ms 단축. transform 은 80ms 유지
             하되 measuring 구간에서만 추가 억제. background-color 명시해 비합성
             속성(background shorthand) 리스크 제거. */
          transition:
            background-color 80ms ${EASE_OUT},
            box-shadow 80ms ${EASE_OUT},
            border-color 80ms ${EASE_OUT},
            transform 80ms ${EASE_OUT};
          touch-action: manipulation;
          user-select: none;
          /* 기본값 = red phase */
          background-color: var(--signal-stop-strong);
          border: 3px solid ${GB.dark};
          box-shadow: var(--glow-mg-signal-go-off);
        }
        .reaction-btn[data-phase="yellow"] {
          background-color: var(--signal-ready);
          border-color: ${GB.dark};
          /* R1 — yellow 전용 amber glow. "green 으로 넘어가기 직전" 증폭 신호 */
          box-shadow: var(--glow-mg-signal-ready);
        }
        .reaction-btn[data-phase="green"],
        .reaction-btn[data-done="success"] {
          background-color: var(--signal-go);
          /* R1 — green 만 lightest 테두리 + outer glow 로 focal point 선언 */
          border-color: ${GB.lightest};
          box-shadow: var(--glow-mg-signal-go);
        }
        .reaction-btn[data-done="fail"] {
          /* 실패는 빨강 유지 — 결과 상태를 명시 */
          background-color: var(--signal-stop-strong);
          border-color: ${GB.dark};
          box-shadow: var(--glow-mg-signal-go-off);
        }
        /* R2 — 측정 구간(초록 점등~탭)에서 hover/active transform 을 끄고
           transition 도 transform 제외. :active 페인트 비용이 반응 시간 측정에
           끼어들지 않게. */
        .reaction-btn[data-measuring="true"] {
          transition:
            background-color 80ms ${EASE_OUT},
            box-shadow 80ms ${EASE_OUT},
            border-color 80ms ${EASE_OUT};
        }
        .reaction-btn[data-measuring="true"]:active {
          transform: none;
        }
        .reaction-btn:focus-visible {
          /* 4px offset 으로 outline 이 버튼 바깥 MinigameShell 배경 위에 놓임 —
             배경이 어두우므로 lightest 로 대비 확보. */
          outline: 2px solid ${GB.lightest};
          outline-offset: 4px;
        }
        /* R3 — 키보드 포커스로 도달한 상태에서는 :active scale 을 끈다. Space
           한 번으로도 잠깐 눌려 스케일 애니가 트리거되는데, 반응 게임에선 불필요한
           모션이고 측정 창에서 공정성을 해침. */
        .reaction-btn:focus-visible:active {
          transform: none;
        }
        @media (hover: hover) and (pointer: fine) {
          .reaction-btn:not(:disabled):hover {
            transform: scale(1.02);
            filter: brightness(1.08);
          }
          /* 측정 구간 hover 도 억제 */
          .reaction-btn[data-measuring="true"]:hover {
            transform: none;
            filter: none;
          }
        }
        .reaction-btn:not(:disabled):not([data-measuring="true"]):active {
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
