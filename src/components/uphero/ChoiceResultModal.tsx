"use client";

/**
 * Up Hero — Phase 10: 이벤트 선택 결과 모달.
 *
 * 유저 피드백:
 *   "이벤트 선택 뒤에 결과를 모달로 한 번 보여주고 자동으로 계속 진행하는 것도
 *    도움이 될 듯."
 *
 * 이전: 선택지 탭 → 결과 narrative 가 로그에 push → 다음 tick 즉시 진행.
 *   결과 narrative 가 대사가 쏟아지는 전투 로그 사이에 묻혀 "내 선택이 뭘
 *   가져왔는지" 읽을 틈이 없음.
 *
 * 개선: 결과 narrative 를 모달로 2.6초 강조 + "계속" CTA.
 *   - 자동 dismiss (2600ms 카운트다운 bar) 로 수동 탭 없이도 진행
 *   - 명시 CTA 로 빨리 넘어가고 싶으면 즉시 해제
 *   - 모달 열린 동안 DungeonView tick 은 pause → 읽을 시간 보장
 *
 * 설계:
 *   - UI-only. store 변경 없음. session.log 에 "> " prefix narrative 가
 *     추가되는 순간을 DungeonView 에서 감지해 이 컴포넌트 표시.
 *   - reduced-motion 사용자: 카운트다운 bar 대신 즉시 CTA focus.
 */

import { useEffect, useRef, useState } from "react";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { buildSummaryFromData } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";

interface ChoiceResultModalProps {
  /** "> 선택 → 결과" narrative. 비어있지 않음. legacy fallback. */
  text: string;
  /**
   * Phase 11c R4 — effects 요약 (예: "경험치 +50 · 시간 -3"). null/undefined 면 표시 안 함.
   * Phase 13b — summaryData (structured) 가 있으면 다국어 라벨로 빌드. 없으면
   *   summary string fallback (legacy save).
   */
  summary?: string | null;
  summaryData?: {
    xp?: number;
    coins?: number;
    heal?: number;
    damage?: number;
    timeDelta?: number;
  } | null;
  /**
   * Phase 13b — 다국어 narrative. 키 + fallback 쌍이 있으면 t() 로 풀어서
   *   action / result 두 줄을 빌드. text 보다 우선.
   */
  actionLabelKey?: string;
  actionLabelFallback?: string;
  resultTextKey?: string;
  resultTextFallback?: string;
  /** 닫기 콜백 — auto-dismiss 또는 유저 "계속" 탭 모두 호출. */
  onDismiss: () => void;
  /** 자동 dismiss 시간 (기본 2600ms). reduced-motion 이면 무시 → CTA 만. */
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
  onDismiss,
  autoMs = 2600,
}: ChoiceResultModalProps) {
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Esc + focus trap. scrollLock 은 DungeonView 자체가 이미 풀스크린 portal
  // 이라 불필요 (중복 락 방지).
  useModalA11y(containerRef, onDismiss, { noScrollLock: true });

  // Countdown bar — rAF 기반. reduced-motion 이면 스킵 (즉시 CTA 로 직행).
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
    if (reducedMotion) return;
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

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
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
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="choice-result-text"
        className="choice-result-card relative pointer-events-auto mx-4 w-full max-w-sm rounded-md"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.lightest}`,
          outline: "none",
        }}
      >
        {/* Body */}
        <div className="px-4 py-4 flex gap-2.5">
          <PixelIcon name="Zap" size={16} color={GB.lightest} />
          <div className="flex-1">
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
                 Phase 13b — summaryData 가 있으면 다국어 라벨로 조립. */}
            {(summaryData || summary) && (
              <div
                className="typo-caption tabular-nums mt-2"
                style={{
                  color: GB.lightest,
                  background: `${GB.dark}66`,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: `1px solid ${GB.dark}`,
                  display: "inline-block",
                }}
              >
                {summaryData
                  ? buildSummaryFromData(summaryData, t)
                  : summary}
              </div>
            )}
          </div>
        </div>
        {/* Footer — 카운트다운 bar + 계속 CTA */}
        <div
          className="px-4 py-3 flex items-center gap-3"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          {!reducedMotion && (
            <div
              aria-hidden="true"
              className="flex-1 h-[2px] rounded-full overflow-hidden"
              style={{ background: `${GB.dark}` }}
            >
              <div
                style={{
                  width: `${(remaining / autoMs) * 100}%`,
                  height: "100%",
                  background: GB.light,
                }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="choice-result-cta typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 16px",
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
              fontWeight: 600,
            }}
            autoFocus
          >
            {t("uphero.choice.continue")}
          </button>
        </div>

        <style jsx>{`
          .choice-result-card {
            animation: choice-result-in 200ms ${EASE_OUT} both;
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
          @keyframes choice-result-in {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes choice-result-fade {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .choice-result-card,
            .choice-result-backdrop {
              animation: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

/**
 * Phase 13 review P3 — i18n 키가 있으면 t() 로 풀어서 action/result 2 줄 빌드.
 *   둘 다 없으면 null 반환 → 호출자가 text parsing fallback.
 */
function resolveChoiceNarrative(
  t: (
    key: import("@/i18n").DictKey,
    params?: Record<string, string | number>,
  ) => string,
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
    return t(key as import("@/i18n").DictKey);
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

