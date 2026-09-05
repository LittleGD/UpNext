"use client";

/**
 * Up Hero — 이벤트 선택 결과 모달.
 *
 * 유저 피드백 (Phase 10):
 *   "이벤트 선택 뒤에 결과를 모달로 한 번 보여주고 자동으로 계속 진행하는 것도
 *    도움이 될 듯."
 * 유저 피드백 (현재):
 *   "결과를 그냥 한 줄로 띡 띄우지 말고 이벤트 분위기에 맞게 효과와 읽는 데
 *    지장을 주지 않는 모션을 준 팝업 모달이 3초간 떠 있도록. 원하면 탭해서 닫게."
 *
 * 그래서 이 모달의 계약:
 *   1. 노출 3초. 자동 dismiss (reduced-motion 에서도 유지).
 *   2. 결과 톤 4종 (jackpot / boon / neutral / bane) 이 색·아이콘·입자 방향·
 *      진입 모션·글로우 속도를 전부 가른다. → `choiceResultTypes.ts`
 *   3. 본문 텍스트는 진입 애니메이션이 끝나면 완전히 정지한다. 반복 모션은
 *      배경 워시·테두리 글로우·입자 같은 주변부에만. → `ChoiceResultAura.tsx`
 *   4. 모달 아무 데나 탭하면 즉시 닫힌다 (backdrop / 카드 / "계속" CTA 전부).
 *   5. 진입 시 결과 본문에 포커스 → 스크린리더가 톤 라벨 + 결과를 읽는다.
 *
 * 설계:
 *   - UI-only. store 변경 없음. DungeonView 가 session.log 의 choiceResult
 *     entry 를 감지해 이 컴포넌트를 렌더한다.
 *   - 던전 이벤트는 tone/motif 를 안 넘긴다 → summaryData 수치에서 자동 추론.
 *     슬롯머신처럼 수치로 안 잡히는 보상은 tone/motif/rewardLabel 을 명시한다.
 *   - 보더 대신 톤 색 글로우 링 (앱 전역 "보더 금지" 규칙 + 요구된 테두리 연출).
 */

import { useEffect, useRef, useState } from "react";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { affixStatLabel, buildSummaryChips } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";
import ChoiceResultAura from "./ChoiceResultAura";
import {
  CHOICE_TONE_COLOR,
  choiceResultIcon,
  deriveChoiceResultMotif,
  deriveChoiceResultTone,
  type ChoiceResultMotif,
  type ChoiceResultSummaryData,
  type ChoiceResultTone,
} from "./choiceResultTypes";
import type { DictKey } from "@/i18n";

export type {
  ChoiceResultTone,
  ChoiceResultMotif,
  ChoiceResultPresentation,
  ChoiceResultSummaryData,
} from "./choiceResultTypes";

/** 톤 → 스크린리더용 라벨 키. 시각적으로는 색/아이콘/입자가 같은 정보를 준다. */
const TONE_SR_KEY: Record<ChoiceResultTone, DictKey> = {
  jackpot: "uphero.choice.result.tone.jackpot",
  boon: "uphero.choice.result.tone.boon",
  neutral: "uphero.choice.result.tone.neutral",
  bane: "uphero.choice.result.tone.bane",
};

interface ChoiceResultModalProps {
  /** "> 선택 → 결과" narrative. 비어있지 않음. legacy fallback. */
  text: string;
  /**
   * Phase 11c R4 — effects 요약 (예: "경험치 +50 · 시간 -3"). null/undefined 면 표시 안 함.
   * Phase 13b — summaryData (structured) 가 있으면 다국어 라벨로 빌드. 없으면
   *   summary string fallback (legacy save).
   */
  summary?: string | null;
  summaryData?: ChoiceResultSummaryData | null;
  /**
   * Phase 13b — 다국어 narrative. 키 + fallback 쌍이 있으면 t() 로 풀어서
   *   action / result 두 줄을 빌드. text 보다 우선.
   */
  actionLabelKey?: string;
  actionLabelFallback?: string;
  resultTextKey?: string;
  resultTextFallback?: string;
  /**
   * 결과의 정서적 톤. 생략하면 summaryData 수치에서 추론.
   *   슬롯머신처럼 수치로 안 잡히는 결과는 반드시 명시할 것.
   */
  tone?: ChoiceResultTone;
  /** 아이콘 모티프. 생략하면 summaryData 에서 추론. */
  motif?: ChoiceResultMotif;
  /**
   * 수치 요약으로 표현되지 않는 보상 라벨 (이미 t() 로 풀린 문자열).
   *   예: "소실방지권 ×1", "다음 3전투 능력치 +10%".
   */
  rewardLabel?: string | null;
  /**
   * big 티어 (굴림틀 잭팟·소실방지권). jackpot 톤 위에 진입 300ms 2px 셰이크와
   * 픽셀 스파크 낙하를 얹는다. 본문은 진입 뒤 정지 규약 그대로다. reduced-motion
   * 이면 둘 다 빠진다.
   */
  big?: boolean;
  /**
   * "한 번 더" CTA 콜백. 넘기면 "계속" 옆에 두 번째 버튼이 뜬다. 게이트(남은
   * 스핀·코인)는 호출자가 걸어 조건이 안 되면 넘기지 않는다.
   */
  onSpinAgain?: () => void;
  /** 닫기 콜백 — auto-dismiss 또는 유저 탭 모두 호출. */
  onDismiss: () => void;
  /** 자동 dismiss 시간 (기본 3000ms). reduced-motion 에서도 유지된다. */
  autoMs?: number;
}

export default function ChoiceResultModal({
  text,
  summary,
  summaryData,
  actionLabelKey,
  actionLabelFallback,
  resultTextKey,
  resultTextFallback,
  tone,
  motif,
  rewardLabel,
  big = false,
  onSpinAgain,
  onDismiss,
  autoMs = 3000,
}: ChoiceResultModalProps) {
  const reducedMotion = useReducedMotion();
  const { t, language } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // 진입 시 SR 이 결과 본문을 읽도록 본문 블록에 initial focus.
  //   기본값(첫 focusable = "계속" CTA)이면 "계속" 만 읽히고 결과를 놓친다.
  const bodyRef = useRef<HTMLDivElement>(null);
  // Esc + focus trap. scrollLock 은 DungeonView 자체가 이미 풀스크린 portal
  // 이라 불필요 (중복 락 방지).
  useModalA11y(containerRef, onDismiss, {
    noScrollLock: true,
    initialFocus: bodyRef,
  });

  // Countdown bar — rAF 기반.
  //
  // Phase 11c R4 bugfix — onDismiss 를 ref 패턴으로 안정화. 부모 (DungeonView) 가
  //   inline arrow 로 넘기기 때문에 매 render 마다 새 identity → 이전엔 deps 에
  //   포함되어 effect 재실행 → performance.now() 새로 찍혀 remaining 이 full 로
  //   점프 → "바가 튀면서 줄어드는" 현상. 이제 onDismiss 는 deps 에서 제외.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    // render 중 ref 쓰기 금지 (react-hooks/refs) — 읽는 곳이 rAF 콜백뿐이라 commit 후 갱신로 충분
    onDismissRef.current = onDismiss;
  });
  const [remaining, setRemaining] = useState(autoMs);
  useEffect(() => {
    // reduced-motion: 카운트다운 bar 만 없앤다. 자동 dismiss 자체는 유지 —
    //   이전 구현은 여기서 early return 해 모션을 끈 사용자에게만 모달이
    //   영원히 떠 있었다 (탭하기 전까지 탐험이 멈춤).
    if (reducedMotion) {
      const id = window.setTimeout(() => onDismissRef.current(), autoMs);
      return () => window.clearTimeout(id);
    }
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const left = Math.max(0, autoMs - elapsed);
      setRemaining(left);
      if (left <= 0) {
        onDismissRef.current();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [autoMs, reducedMotion]);

  // "> 선택 → 결과" prefix 를 잘라 선택 / 결과 두 줄로 분리.
  //   "> 싸운다 → 영웅이 적을 쓰러뜨렸다" → action="싸운다" / result="영웅이 적을..."
  // Phase 13b — i18n 키가 있으면 t() 로 풀어서 사용. 없으면 text parsing.
  const parsed =
    resolveChoiceNarrative(t, {
      actionLabelKey,
      actionLabelFallback,
      resultTextKey,
      resultTextFallback,
    }) ?? parseChoiceNarrative(text);

  const resolvedTone = tone ?? deriveChoiceResultTone(summaryData);
  const resolvedMotif = motif ?? deriveChoiceResultMotif(summaryData);
  const toneColor = CHOICE_TONE_COLOR[resolvedTone];
  const iconName = choiceResultIcon(resolvedMotif, resolvedTone);
  // big 은 jackpot 톤에서만 뜻이 있다. 셰이크·스파크는 모션이라 reduced-motion 에서 뺀다.
  const burst = big && resolvedTone === "jackpot" && !reducedMotion;

  return (
    <div
      className={`choice-result-root absolute inset-0 flex items-center justify-center pointer-events-none${burst ? " choice-result-shake" : ""}`}
      style={{ zIndex: 40 }}
    >
      {/* backdrop — 반투명 + 미세 blur. click 은 dismiss 로 */}
      <button
        type="button"
        aria-label={t("uphero.choice.result.ariaLabel")}
        onClick={onDismiss}
        className="choice-result-backdrop absolute inset-0 pointer-events-auto"
        style={{
          background: `${GB.darkest}cc`,
          backdropFilter: "blur(2px)",
          border: "none",
          padding: 0,
        }}
      />

      {/* 분위기 레이어 — 카드 뒤. 움직이는 것은 전부 여기에만 있다. */}
      <ChoiceResultAura tone={resolvedTone} reducedMotion={reducedMotion} burst={burst} />

      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="choice-result-tone choice-result-text"
        aria-describedby={summaryData || summary || rewardLabel ? "choice-result-effects" : undefined}
        // 유저 요구 — "원하면 탭해서 닫을 수 있게". 카드 어디를 눌러도 닫힌다.
        //   키보드 경로는 Esc (useModalA11y) 와 "계속" CTA 가 이미 커버한다.
        onClick={onDismiss}
        className={`choice-result-card tone-${resolvedTone} relative pointer-events-auto mx-4 w-full max-w-sm rounded-md`}
        style={
          {
            background: GB.darkest,
            outline: "none",
            // 보더 대신 톤 글로우 링. 애니메이션이 돌면 keyframes 가 덮어쓴다.
            boxShadow: `0 0 0 2px ${toneColor}2e, 0 0 22px 3px ${toneColor}2e, 0 12px 32px ${GB.darkest}cc`,
            "--glow-1": `${toneColor}33`,
            "--glow-2": `${toneColor}70`,
            "--glow-base": `0 12px 32px ${GB.darkest}cc`,
          } as React.CSSProperties
        }
      >
        {/* 톤 라벨 — 시각적으로는 색/아이콘/입자가 같은 말을 하므로 SR 전용. */}
        <span id="choice-result-tone" className="sr-only">
          {t(TONE_SR_KEY[resolvedTone])}
        </span>

        {/* Body */}
        <div className="px-4 py-4 flex gap-2.5">
          <PixelIcon name={iconName} size={16} color={toneColor} />
          <div
            ref={bodyRef}
            tabIndex={-1}
            className="flex-1"
            style={{ outline: "none" }}
          >
            {parsed.action && (
              <div
                className="typo-caption mb-1.5"
                style={{
                  color: GB.light,
                  letterSpacing: "0.04em",
                  opacity: 0.85,
                }}
              >
                {parsed.action}
              </div>
            )}
            <div
              id="choice-result-text"
              className="typo-body leading-relaxed"
              style={{ color: GB.lightest }}
            >
              {parsed.result}
            </div>
            {/* Phase 11c R4 — 효과 수치 요약. "경험치 +50 · 시간 -3" 등.
                 Phase 13b — summaryData 가 있으면 다국어 라벨로 조립.
                 rewardLabel — 수치로 안 잡히는 보상 (방지권/상자/버프). */}
            {(summaryData || summary || rewardLabel) && (
              <div
                id="choice-result-effects"
                className="mt-2 flex flex-wrap items-center gap-1.5"
              >
                {/* Phase 4-D — 효과 하나에 칩 하나 (배경 단계만, 보더/아이콘 없음).
                     legacy save 의 summary 문자열은 칩 하나로 그대로. */}
                {(summaryData
                  ? buildSummaryChips(summaryData, t, (s) => affixStatLabel(s, language))
                  : summary
                    ? [summary]
                    : []
                ).map((chip, i) => (
                  <span
                    key={`${i}-${chip}`}
                    className="typo-caption tabular-nums"
                    style={{
                      color: GB.lightest,
                      background: `${GB.dark}80`,
                      padding: "4px 8px",
                      borderRadius: 4,
                      display: "inline-block",
                    }}
                  >
                    {chip}
                  </span>
                ))}
                {rewardLabel && (
                  <span
                    className="typo-caption"
                    style={{
                      color: toneColor,
                      background: `${toneColor}1f`,
                      padding: "4px 8px",
                      borderRadius: 4,
                      display: "inline-block",
                      fontWeight: 600,
                    }}
                  >
                    {rewardLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Footer — 카운트다운 bar + 계속 CTA */}
        <div className="px-4 pb-3 pt-1 flex items-center gap-3">
          {/* reduced-motion 이면 bar 자리를 빈 spacer 로 — CTA 가 왼쪽으로
              끌려와 레이아웃이 무너지지 않게. 자동 dismiss 는 계속 돈다. */}
          {reducedMotion ? (
            <div className="flex-1" />
          ) : (
            <div
              aria-hidden="true"
              className="flex-1 h-[2px] rounded-full overflow-hidden"
              style={{ background: `${GB.dark}` }}
            >
              <div
                style={{
                  width: `${(remaining / autoMs) * 100}%`,
                  height: "100%",
                  background: toneColor,
                }}
              />
            </div>
          )}
          {/* "한 번 더" — 굴림틀 전용 두 번째 CTA. 카드 탭 = 닫기 이므로 전파를 끊는다. */}
          {onSpinAgain && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSpinAgain();
              }}
              className="choice-result-cta typo-caption rounded"
              style={{
                minHeight: 44,
                padding: "10px 14px",
                background: `${GB.dark}`,
                color: toneColor,
                border: "none",
                fontWeight: 600,
              }}
            >
              {t("uphero.slot.again")}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="choice-result-cta typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 16px",
              background: toneColor,
              color: GB.darkest,
              border: "none",
              fontWeight: 600,
            }}
          >
            {t("uphero.choice.continue")}
          </button>
        </div>

      </div>

      {/* styled-jsx 스코프: 루트 셰이크까지 맞히려면 루트 바로 아래. */}
      <style jsx>{`
        /* 진입 모션은 톤마다 다르되 전부 300ms 안에 끝난다.
           끝나고 나면 카드와 본문은 완전히 정지 — 읽는 동안 움직이는 것은
           ChoiceResultAura 의 주변부와 이 카드의 글로우 링뿐이다. */
        .choice-result-card {
          animation: cr-in-neutral 200ms ${EASE_OUT} both;
        }
        .choice-result-card.tone-jackpot {
          animation:
            cr-in-jackpot 280ms ${EASE_OUT} both,
            cr-glow 1100ms ease-in-out 280ms infinite;
        }
        .choice-result-card.tone-boon {
          animation:
            cr-in-boon 220ms ${EASE_OUT} both,
            cr-glow 1900ms ease-in-out 220ms infinite;
        }
        .choice-result-card.tone-bane {
          animation:
            cr-in-bane 260ms ${EASE_OUT} both,
            cr-glow 1500ms ease-in-out 260ms infinite;
        }
        .choice-result-backdrop {
          animation: choice-result-fade 180ms ${EASE_OUT} both;
        }
        .choice-result-cta {
          transition: transform 120ms ${EASE_OUT};
        }
        .choice-result-cta:active {
          transform: scale(0.97);
        }
        @keyframes cr-in-neutral {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes cr-in-boon {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes cr-in-jackpot {
          0% {
            opacity: 0;
            transform: scale(0.86);
          }
          60% {
            opacity: 1;
            transform: scale(1.035);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }
        /* 나쁜 결과는 위에서 떨어져 한 번 눌린 뒤 멈춘다. 흔들지는 않는다 —
           본문이 흔들리면 3초 안에 못 읽는다. */
        @keyframes cr-in-bane {
          0% {
            opacity: 0;
            transform: translateY(-14px) scale(1.03);
          }
          70% {
            opacity: 1;
            transform: translateY(2px) scale(0.995);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes cr-glow {
          0%,
          100% {
            box-shadow:
              0 0 0 2px var(--glow-1),
              0 0 20px 2px var(--glow-1),
              var(--glow-base);
          }
          50% {
            box-shadow:
              0 0 0 3px var(--glow-2),
              0 0 34px 8px var(--glow-2),
              var(--glow-base);
          }
        }
        @keyframes choice-result-fade {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        /* big 티어 — 진입 300ms 동안만 루트가 2px 흔들린다. 끝나면 본문 정지 규약 그대로. */
        .choice-result-shake {
          animation: choice-result-shake 300ms linear both;
        }
        @keyframes choice-result-shake {
          0%,
          100% {
            transform: translate(0, 0);
          }
          15% {
            transform: translate(2px, -1px);
          }
          30% {
            transform: translate(-2px, 1px);
          }
          45% {
            transform: translate(2px, 1px);
          }
          60% {
            transform: translate(-2px, -1px);
          }
          75% {
            transform: translate(1px, 0);
          }
          90% {
            transform: translate(-1px, 0);
          }
        }
        /* reduced-motion — 모든 모션을 페이드로 강등. 자동 dismiss 는 유지. */
        @media (prefers-reduced-motion: reduce) {
          .choice-result-card,
          .choice-result-card.tone-jackpot,
          .choice-result-card.tone-boon,
          .choice-result-card.tone-bane {
            animation: choice-result-fade 160ms linear both !important;
          }
          .choice-result-backdrop {
            animation: choice-result-fade 160ms linear both !important;
          }
          .choice-result-shake {
            animation: none !important;
          }
          .choice-result-cta {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Phase 13 review P3 — i18n 키가 있으면 t() 로 풀어서 action/result 2 줄 빌드.
 *   둘 다 없으면 null 반환 → 호출자가 text parsing fallback.
 */
function resolveChoiceNarrative(
  t: (key: DictKey, params?: Record<string, string | number>) => string,
  opts: {
    actionLabelKey?: string;
    actionLabelFallback?: string;
    resultTextKey?: string;
    resultTextFallback?: string;
  },
): { action: string | null; result: string } | null {
  const { actionLabelKey, actionLabelFallback, resultTextKey, resultTextFallback } = opts;
  if (!actionLabelFallback && !resultTextFallback) return null;
  const resolve = (key?: string, fallback?: string): string => {
    if (!fallback) return "";
    if (!key) return fallback;
    return t(key as DictKey);
  };
  return {
    action: actionLabelFallback ? resolve(actionLabelKey, actionLabelFallback) : null,
    result: resolve(resultTextKey, resultTextFallback),
  };
}

/** "> 선택 → 결과" 텍스트를 action / result 로 분리. 포맷 불일치 시 통째로 result. */
function parseChoiceNarrative(text: string): {
  action: string | null;
  result: string;
} {
  const stripped = text.replace(/^>\s*/, "");
  const arrowIdx = stripped.indexOf("→");
  if (arrowIdx < 0) return { action: null, result: stripped };
  const action = stripped.slice(0, arrowIdx).trim();
  const result = stripped.slice(arrowIdx + 1).trim();
  return { action: action || null, result };
}
