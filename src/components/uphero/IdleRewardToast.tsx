"use client";

/**
 * Up Hero — Idle reward toast.
 *
 * Phase 5b.1: 앱을 재진입할 때 이전 세션부터 경과한 시간만큼 영웅이 "수련"
 * 했다는 연출 + 보상 표시.
 *
 * Phase 9d — UX 전면 개편 (유저 피드백 반영):
 *   - 이전엔 4초 auto-dismiss + "수련 보상" 이름만 있어 유저가 "이게 뭐지?"
 *     하는 사이 사라져 이해 못 함.
 *   - 이제 auto-dismiss 제거 → 명시적 "확인" 버튼 탭까지 유지.
 *   - 기본 카드에 "영웅은 앱이 꺼진 동안에도 수련합니다" 한 줄 설명 추가.
 *   - 우상단 info 버튼 → 탭 시 자세한 설명 확장 (규칙: 시간/최대/공식).
 *   - "수련 보상" → "영웅의 수련 성과" 로 의미 전달 강화.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { formatElapsedI18n } from "@/lib/idleAccrual";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useCountUp } from "@/hooks/useCountUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";

export default function IdleRewardToast() {
  const { t } = useTranslation();
  const pathname = usePathname();
  // Phase 9d-fix — Header 가 full/compact 여부에 따라 toast top 위치 결정.
  //   Header 의 isFullHeader 조건과 동일 (pathname === "/").
  const headerIsFull = pathname === "/";
  const reward = useUpHeroStore((s) => s.idleReward);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeIdleReward);
  // Phase 5c-fix #1: 다른 blocking modal (SessionResultModal / ClassAwakenModal)
  // 이 떠있으면 토스트가 backdrop 뒤에 숨어 유저가 놓칠 수 있음.
  // 해당 modal 들이 모두 사라질 때까지 mount / timer 를 지연.
  const sessionStatus = useUpHeroStore((s) => s.currentSession?.status);
  const pendingClassAwaken = useUpHeroStore((s) => s.pendingClassAwaken);
  const blocked =
    sessionStatus === "completed" || pendingClassAwaken !== null;

  const [mounted, setMounted] = useState(false);
  // Phase 11c R4 — reduced-motion 대응. slide 제거, fade 만 유지.
  const reducedMotion = useReducedMotion();
  /** Phase 9d — 자세한 설명 펼침 토글 (info 버튼 탭). */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!reward) return;
    if (blocked) return;
    const rafId = requestAnimationFrame(() => setMounted(true));
    // Phase 9d — auto-dismiss 타이머 제거. 유저가 직접 "확인" 탭할 때까지 유지.
    //   4초 안에 사라지던 게 "수련 보상이 뭐지" 하는 사이 증발해 의미 반감됐던 문제.
    return () => cancelAnimationFrame(rafId);
  }, [reward, blocked]);

  // Phase 8b — mount 후 XP/coin 을 count-up 으로 올려 "이만큼이나!" 감각 전달.
  // mounted 가 true 된 뒤에만 started — reward 가 바뀌어도 key effect 로 재실행됨.
  const xpDisplay = useCountUp(reward?.xp ?? 0, 700, mounted);
  const coinDisplay = useCountUp(reward?.coins ?? 0, 700, mounted);

  if (!reward) return null;
  if (blocked) return null;

  const onDismiss = () => {
    setMounted(false);
    window.setTimeout(() => acknowledge(), 240);
  };

  // Phase 13 review — formatElapsed 는 한국어 하드코딩. 다국어 헬퍼로 교체.
  //   (구 export 는 다른 non-component 경로 호환 위해 유지.)
  const elapsed = formatElapsedI18n(reward.rawElapsedMin, t);
  const capped = reward.rawElapsedMin > reward.elapsedMin;

  // Phase 9d-fix — IdleRewardToast 는 주로 영웅 탭 (playground) 에서 뜸.
  //   해당 페이지 Header 는 compact (py-2 + typo-body) 라 실제 bottom y 가 약 44px.
  //   이전 52px 하드코딩은 full 헤더 기준 → compact 에선 토스트 위에 여백이 떠 보임.
  //   이제 Header 모드 판별해 대응값 사용 (44 vs 56).
  const toastTop = headerIsFull
    ? "calc(env(safe-area-inset-top) + 56px)"
    : "calc(env(safe-area-inset-top) + 44px)";

  // Phase 11c R4 — reduced-motion 에서 translateY slide 제거. opacity fade 만.
  const slideTransform = reducedMotion ? "translateX(-50%)" : `translateX(-50%) translateY(${mounted ? 0 : "-8px"})`;
  return (
    <div
      role="alertdialog"
      aria-labelledby="idle-reward-title"
      aria-describedby="idle-reward-body"
      className="fixed left-1/2 z-[60] rounded typo-caption"
      style={{
        top: toastTop,
        transform: slideTransform,
        opacity: mounted ? 1 : 0,
        background: GB.darkest,
        color: GB.light,
        border: `1px solid ${GB.lightest}`,
        padding: "10px 12px",
        minWidth: 260,
        maxWidth: "calc(100dvw - 32px)",
        transition: reducedMotion
          ? `opacity 240ms ${EASE_OUT}`
          : `opacity 240ms ${EASE_OUT}, transform 240ms ${EASE_OUT}`,
      }}
    >
      {/* Title row: icon + 라벨 + info toggle */}
      <div className="flex items-center gap-2">
        <PixelIcon name="Moon" size={14} color={GB.lightest} />
        <span id="idle-reward-title" style={{ color: GB.lightest, fontWeight: 600 }}>
          {t("uphero.idle.title")}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="idle-reward-info ml-auto rounded"
          style={{
            padding: "4px 8px",
            minHeight: 28,
            minWidth: 28,
            background: expanded ? `${GB.lightest}22` : "transparent",
            color: GB.lightest,
            border: `1px solid ${GB.lightest}55`,
            fontSize: 11,
            letterSpacing: "0.05em",
          }}
          aria-expanded={expanded}
          aria-label={expanded ? t("uphero.idle.close") : t("uphero.idle.expandAria")}
        >
          {expanded ? t("uphero.idle.close") : "?"}
        </button>
      </div>

      {/* Body: 수치 + 한 줄 설명 */}
      <div id="idle-reward-body" className="mt-1.5" style={{ lineHeight: 1.5 }}>
        {/* Phase 12 i18n — elapsed 를 span 으로 강조하기 위해 dangerouslyInnerHTML
             대신 문자열 분할. t() 가 {elapsed} 자리를 placeholder 로 보존 */}
        {(() => {
          const body = t("uphero.idle.body", { elapsed: "__ELAPSED__" });
          const [before, after] = body.split("__ELAPSED__");
          return (
            <>
              {before}
              <span style={{ color: GB.lightest }}>{elapsed}</span>
              {after}
            </>
          );
        })()}
        {capped && (
          <span style={{ color: GB.light, opacity: 0.7 }}>{t("uphero.idle.capped")}</span>
        )}
        <br />
        <span className="tabular-nums">
          +<span style={{ color: GB.lightest, fontWeight: 600 }}>{xpDisplay}</span> XP
          {" · "}+
          <span style={{ color: GB.lightest, fontWeight: 600 }}>{coinDisplay}</span> C
        </span>
      </div>

      {/* Expanded — 자세한 설명.
          Phase 9d: 유저가 "수련 보상이 뭔지" 이해할 수 있게 규칙을 드러냄.
          expanded 일 때만 max-height 늘려 smooth reveal. */}
      <div
        className="overflow-hidden"
        style={{
          maxHeight: expanded ? 160 : 0,
          opacity: expanded ? 1 : 0,
          transition: `max-height 240ms ${EASE_OUT}, opacity 180ms ${EASE_OUT}`,
        }}
      >
        <div
          className="mt-2.5 pt-2.5"
          style={{
            borderTop: `1px dashed ${GB.dark}`,
            color: GB.light,
            lineHeight: 1.55,
            fontSize: 12,
          }}
        >
          {t("uphero.idle.explain.1")}
          <br />
          {t("uphero.idle.explain.2")}
          <br />
          <span style={{ opacity: 0.75 }}>{t("uphero.idle.explain.3")}</span>
        </div>
      </div>

      {/* Dismiss — 명시적 "확인" 버튼.
          이전엔 자동 사라짐 + 카드 전체 탭으로만 닫혔음. 이제 분명한 intent. */}
      <button
        type="button"
        onClick={onDismiss}
        className="idle-reward-dismiss mt-3 w-full rounded typo-caption"
        style={{
          minHeight: 36,
          padding: "8px 12px",
          background: `${GB.lightest}`,
          color: GB.darkest,
          border: `1px solid ${GB.lightest}`,
          fontWeight: 600,
        }}
      >
        {t("uphero.idle.ok")}
      </button>

      <style jsx>{`
        .idle-reward-info,
        .idle-reward-dismiss {
          transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        .idle-reward-info:active,
        .idle-reward-dismiss:active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
}
