"use client";

/**
 * Up Hero — 선택지 패널.
 *
 * session.status === "awaitingChoice" 일 때 표시.
 * 하단 오버레이로 슬라이드 업. 선택 시 resolveChoice() 호출.
 */

import { useEffect, useRef, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import {
  GB,
  EASE_OUT,
  EASE_DRAWER,
  gbClass,
  GB_WARN,
} from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import { flavorText } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";

/**
 * Phase 8b — ChoicePanel prompt 용 typewriter.
 * 선택지 prompt 가 한 글자씩 타이핑되면 "세계가 말을 걸어오는" 감각.
 * 선택지 버튼은 prompt 가 끝난 뒤 잠깐 지난 뒤 tappable (조급한 탭 방지).
 * 짧은 prompt (≤ 20자) 는 12ms/글자, 긴 prompt 는 14ms/글자.
 */
function useChoiceTypewriter(text: string, promptKey: string): {
  visible: string;
  done: boolean;
} {
  // Phase 9a — reduced-motion 사용자에겐 즉시 전체 표시.
  const reducedMotion = useReducedMotion();
  const [chars, setChars] = useState(0);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (reducedMotion) {
      setChars(text.length);
      return;
    }
    setChars(0);
    const perChar = text.length <= 20 ? 12 : 14;
    let i = 0;
    const tick = () => {
      i += 1;
      setChars(i);
      if (i >= text.length) {
        timerRef.current = null;
        return;
      }
      timerRef.current = window.setTimeout(tick, perChar);
    };
    timerRef.current = window.setTimeout(tick, perChar);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptKey, reducedMotion]);
  return { visible: text.slice(0, chars), done: chars >= text.length };
}

export default function ChoicePanel() {
  const session = useUpHeroStore((s) => s.currentSession);
  const resolveChoice = useUpHeroStore((s) => s.resolveChoice);
  const { t, language } = useTranslation();
  // Phase 9a — onAbandon 은 DungeonView footer 로 단일화. 여기 중복 정의는 제거.
  //   이전엔 ChoicePanel 에도 붙어있었으나 실제 어떤 JSX 에도 wire 되지 않은 dead code.
  //   abandonSession selector 자체가 쓸모 없어 구독도 제거 → 불필요 re-render 감소.

  // subtle entrance — use data-mounted pattern
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // 읽기 safety
  const choiceIdx = session?.pendingChoiceIndex ?? null;
  const entry =
    choiceIdx != null && session ? session.log[choiceIdx] : null;
  const isChoice = entry?.type === "choice";
  const isEncounter = isChoice && entry.variant === "encounter";
  const timeoutMs = isChoice ? entry.timeoutMs : undefined;
  const defaultIdx = isChoice ? entry.defaultOptionIndex : undefined;

  // Encounter choice 전용 5초 auto-select countdown.
  // requestAnimationFrame 루프로 매 프레임(60Hz) 업데이트 — vsync 에 맞춰
  // jitter 없이 부드럽게 카운트다운 bar 가 줄어든다.
  // (setInterval 100ms 는 저사양에서 버벅였음)
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!isChoice || !timeoutMs || defaultIdx == null) {
      setRemainingMs(null);
      return;
    }
    const start = performance.now();
    setRemainingMs(timeoutMs);
    let rafId = 0;
    let finished = false;
    const tick = () => {
      const elapsed = performance.now() - start;
      const left = timeoutMs - elapsed;
      if (left <= 0) {
        finished = true;
        setRemainingMs(0);
        resolveChoice(defaultIdx);
        return;
      }
      setRemainingMs(left);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (!finished) cancelAnimationFrame(rafId);
    };
    // choice entry 의 timestamp 로 identity 구분 (새 encounter choice 마다 리셋)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry && isChoice ? entry.timestamp : null]);

  // Phase 8b — prompt typewriter. entry.timestamp 가 바뀌면 재시작.
  const promptKey = String(entry?.type === "choice" ? entry.timestamp : 0);
  // Phase 12 i18n framework — prompt 가 promptI18nKey 로 지정됐으면 현재
  //   언어에서 조회. key 없거나 미등록이면 prompt literal 그대로.
  //   Note: typewriter 용 `promptKey` (timestamp 기반) 와 충돌 방지 위해
  //   prompt 의 i18n key 는 `promptI18nKey` 로 네이밍.
  const rawPrompt = entry?.type === "choice" ? entry.prompt : "";
  const promptI18nKey = entry?.type === "choice" ? entry.promptKey : undefined;
  const promptText = flavorText(rawPrompt, promptI18nKey, language);
  const { visible: promptVisible, done: promptDone } = useChoiceTypewriter(
    promptText,
    promptKey,
  );

  if (!session || !isChoice) return null;

  return (
    <div
      className="absolute inset-0 flex items-end pointer-events-none"
      style={{
        // log 영역 위로 올라오는 sheet. footer 는 이 컨테이너 밖에 있으므로
        // 그대로 보인다 (계층 충돌 없음).
        background: `linear-gradient(to top, ${GB.darkest}dd 0%, ${GB.darkest}60 40%, transparent 100%)`,
      }}
    >
      <div
        className="w-full pointer-events-auto"
        style={{
          background: GB.darkest,
          // Phase 12 — mystery event 때는 border top 을 GB_WARN 으로 전환해
          //   "수상한 이벤트" 도착 순간을 시각적으로 차별화.
          borderTop: `1px solid ${entry.isMystery ? GB_WARN : GB.lightest}`,
          // footer safe-area 는 footer 자체가 처리하므로 ChoicePanel 은 기본 padding 만.
          padding: "12px 12px 14px 12px",
          transform: mounted ? "translateY(0)" : "translateY(100%)",
          opacity: mounted ? 1 : 0,
          // 올라오면서 미세하게 blur(4px) → 0 으로 풀리면서 로그 영역과의 경계가 녹아든다.
          // translateY 와 동시 진행, 약간 짧은 220ms 로 sheet 이 "자리잡은" 뒤 선명해진다.
          filter: mounted ? "blur(0px)" : "blur(4px)",
          transition: `transform 320ms ${EASE_DRAWER}, opacity 200ms ${EASE_OUT}, filter 220ms ${EASE_OUT}`,
        }}
      >
        {/* Phase 12 — mystery event 배지. 플레이어에게 "이 이벤트는 효과가
             증폭된 수상한 이벤트" 를 즉시 알린다. 모달 헤더 최상단에 컴팩트한
             "?" chip 으로 배치. */}
        {entry.isMystery && (
          <div
            className="typo-micro inline-flex items-center gap-1 mb-2 px-1.5 py-0.5 rounded-sm tabular-nums"
            style={{
              color: GB_WARN,
              background: `${GB_WARN}1a`,
              border: `1px solid ${GB_WARN}`,
              letterSpacing: "0.08em",
              fontSize: 10,
            }}
            aria-label={t("uphero.choice.mysteryBadgeAria")}
          >
            <span style={{ fontWeight: 700 }}>?</span>
            <span>{t("uphero.choice.mysteryBadge")}</span>
          </div>
        )}
        <div
          className="typo-caption mb-3 pl-2 flex items-start gap-1.5"
          style={{
            color: GB.lightest,
            borderLeft: `2px solid ${entry.isMystery ? GB_WARN : GB.lightest}`,
          }}
        >
          <PixelIcon
            name="Zap"
            size={14}
            color={entry.isMystery ? GB_WARN : GB.lightest}
          />
          <span className="flex-1">
            {promptVisible}
            {!promptDone && (
              <span className="uphero-typewriter-caret" aria-hidden="true">
                ▍
              </span>
            )}
          </span>
        </div>
        {/* 선택지 — prompt 가 타이핑 중이면 살짝 dim + 키보드/클릭 완전 차단.
            타이핑 완료 직후에만 tappable. 조급한 오탭 방지 + 극적 pacing.
            Phase 11c R4 R2 — 기존엔 pointerEvents 만 막고 keyboard focus 가능했음
            → promptDone 전에 Enter 로 조기 선택 가능. disabled 로 완전 차단. */}
        <div
          className="flex flex-col gap-1.5"
          role="radiogroup"
          aria-label="선택지"
          style={{
            opacity: promptDone ? 1 : 0.45,
            transition: `opacity 180ms ${EASE_OUT}`,
          }}
        >
          {entry.options.map((opt, i) => (
            <ChoiceButton
              key={i}
              onClick={() => resolveChoice(i)}
              disabled={!promptDone}
              autoFocus={promptDone && i === 0}
            >
              <span className="typo-caption" style={{ color: GB.light }}>
                {i + 1}.
              </span>{" "}
              <span className="typo-caption" style={{ color: GB.lightest }}>
                {flavorText(opt.label, opt.labelKey, language)}
              </span>
            </ChoiceButton>
          ))}
        </div>

        {/* Encounter 전용 countdown bar — rAF 루프가 remainingMs 를 프레임마다
             업데이트하므로 width 가 vsync 에 맞춰 smooth 하게 줄어든다.
             transition 없이 직접 값 반영 (transition 을 걸면 rAF 샘플링 지연). */}
        {isEncounter && remainingMs != null && timeoutMs != null && (
          <div
            className="mx-auto mt-3 h-[2px] rounded-full overflow-hidden"
            style={{ width: "60%", background: `${GB.dark}` }}
            aria-hidden="true"
          >
            <div
              style={{
                width: `${Math.max(0, (remainingMs / timeoutMs) * 100)}%`,
                height: "100%",
                background: GB.lightest,
              }}
            />
          </div>
        )}

        {/* hint — encounter 는 남은 초, 일반 이벤트는 "탐험 정지" */}
        <div
          className={`typo-caption text-center ${gbClass.textDim}`}
          style={{ marginTop: isEncounter && remainingMs != null ? 6 : 12 }}
        >
          {isEncounter && remainingMs != null
            ? `${Math.ceil(remainingMs / 1000)}초 안에 선택 — 무응답 시 자동으로 "싸운다"`
            : "선택하기 전까지 탐험은 멈춰 있다"}
        </div>
      </div>
    </div>
  );
}

// Phase 9c — inline onMouseDown/Up/Leave/TouchStart/TouchEnd 5핸들러가 복잡했던
//   구식 패턴 → CSS :active / :hover 로 단일화. min-height 44 로 tap target 확보.
//   다른 uphero 버튼들과 같은 구조.
function ChoiceButton({
  children,
  onClick,
  disabled = false,
  autoFocus = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className="choice-btn font-mono text-[11px] text-left px-3 py-2.5 rounded"
      style={{
        minHeight: 44,
        background: `${GB.dark}aa`,
        border: `1px solid ${GB.light}`,
        color: GB.light,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
      <style jsx>{`
        .choice-btn {
          transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
          /* 기본 outline 제거 — :focus-visible 에서 명시적 ring 으로 대체 */
          outline: none;
        }
        .choice-btn:hover {
          background: ${GB.dark};
        }
        .choice-btn:active {
          transform: scale(0.97);
          background: ${GB.dark};
        }
        /* Emil a11y — 키보드 탭 유저가 어느 선택지에 focus 됐는지 즉시 식별.
             pointer 사용자는 :focus-visible 불발동이라 hover 그대로 유지. */
        .choice-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
          background: ${GB.dark};
        }
      `}</style>
    </button>
  );
}
