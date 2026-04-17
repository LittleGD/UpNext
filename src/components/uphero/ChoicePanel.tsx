"use client";

/**
 * Up Hero — 선택지 패널.
 *
 * session.status === "awaitingChoice" 일 때 표시.
 * 하단 오버레이로 슬라이드 업. 선택 시 resolveChoice() 호출.
 */

import { useEffect, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { GB, EASE_OUT, EASE_DRAWER, gbClass } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";

export default function ChoicePanel() {
  const session = useUpHeroStore((s) => s.currentSession);
  const resolveChoice = useUpHeroStore((s) => s.resolveChoice);
  const abandonSession = useUpHeroStore((s) => s.abandonSession);

  const onAbandon = () => {
    const floor = session?.currentFloor ?? 0;
    const msg = `탐험을 포기하고 캠프로 돌아갈까요?\n\n지금까지 획득한 보상 (XP, 코인, 장비) 은 모두 유지됩니다.\n단, F${floor} 의 보스는 놓칩니다.`;
    if (confirm(msg)) abandonSession();
  };

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
          borderTop: `1px solid ${GB.lightest}`,
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
        <div
          className="typo-caption mb-3 pl-2 flex items-start gap-1.5"
          style={{
            color: GB.lightest,
            borderLeft: `2px solid ${GB.lightest}`,
          }}
        >
          <PixelIcon name="Zap" size={14} color={GB.lightest} />
          <span className="flex-1">{entry.prompt}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {entry.options.map((opt, i) => (
            <ChoiceButton key={i} onClick={() => resolveChoice(i)}>
              <span className="typo-caption" style={{ color: GB.light }}>
                {i + 1}.
              </span>{" "}
              <span className="typo-caption" style={{ color: GB.lightest }}>
                {opt.label}
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

function ChoiceButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[11px] text-left px-3 py-2 rounded transition-transform"
      style={{
        background: `${GB.dark}aa`,
        border: `1px solid ${GB.light}`,
        color: GB.light,
        transition: `transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT}`,
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
        (e.currentTarget as HTMLButtonElement).style.background = GB.dark;
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLButtonElement).style.background = `${GB.dark}aa`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLButtonElement).style.background = `${GB.dark}aa`;
      }}
      onTouchStart={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
      }}
      onTouchEnd={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
      }}
    >
      {children}
    </button>
  );
}
