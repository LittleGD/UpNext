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

  if (!session || session.pendingChoiceIndex == null) return null;
  const entry = session.log[session.pendingChoiceIndex];
  if (entry?.type !== "choice") return null;

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
          transition: `transform 320ms ${EASE_DRAWER}, opacity 200ms ${EASE_OUT}`,
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

        {/* hint — 포기 버튼은 footer 에 이미 있으므로 여기선 생략 */}
        <div className={`typo-caption mt-3 text-center ${gbClass.textDim}`}>
          선택 전까지 시간은 멈춘다
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
