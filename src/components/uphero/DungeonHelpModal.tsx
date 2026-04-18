"use client";

/**
 * Phase 12f — 던전 인터랙션 도움말 모달.
 *
 * 전투 중 ? 버튼 탭 시 열림. 자원 / 스킬 / 미니게임 / 포기 등 주요 인터랙션을
 * 한 화면에 정리. reduced-motion + useModalA11y 지원.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import PixelIcon from "@/components/icons/PixelIcon";

interface DungeonHelpModalProps {
  onClose: () => void;
}

const HELP_ITEMS: Array<{ icon: string; title: string; desc: string }> = [
  {
    icon: "Heart",
    title: "HP · TIME",
    desc: "HP 0 또는 시간 0 이면 탐험 종료. 시간은 층 이동 · 전투 · 이벤트로 소모.",
  },
  {
    icon: "Zap",
    title: "자원 bar",
    desc: "클래스마다 다른 자원 (분노/마나/기 등). 전투 중 획득해 스킬 발동에 소모.",
  },
  {
    icon: "Star",
    title: "스킬 버튼",
    desc: "자원 충족 + 쿨다운 0 시 탭으로 즉시 발동. 스탯창의 스킬트리에서 해금.",
  },
  {
    icon: "Play",
    title: "속도 / 일시정지",
    desc: "1× / 2× / 4× 로 tick 속도 조정. 중앙 버튼으로 일시정지.",
  },
  {
    icon: "Flag",
    title: "포기",
    desc: "자발적으로 캠프 복귀. 지금까지 얻은 drop 은 모두 유지.",
  },
];

export default function DungeonHelpModal({ onClose }: DungeonHelpModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, { noScrollLock: true });
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      style={{ background: `${GB.darkest}dd` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.lightest}`,
          outline: "none",
        }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <div
            id="help-title"
            className="typo-body"
            style={{ color: GB.lightest, fontWeight: 600 }}
          >
            탐험 도움말
          </div>
          <button
            type="button"
            onClick={onClose}
            className="typo-caption rounded px-2 py-1"
            style={{
              background: "transparent",
              color: GB.light,
              border: `1px solid ${GB.dark}`,
            }}
            aria-label="도움말 닫기"
          >
            닫기
          </button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          {HELP_ITEMS.map((item) => (
            <div key={item.title} className="flex items-start gap-2.5">
              <div
                className="rounded p-1 mt-0.5 shrink-0"
                style={{ background: `${GB.dark}aa` }}
              >
                <PixelIcon name={item.icon} size={14} color={GB.lightest} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="typo-caption"
                  style={{ color: GB.lightest, fontWeight: 600 }}
                >
                  {item.title}
                </div>
                <div className={`typo-micro ${gbClass.textDim}`}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
        <style jsx>{`
          div[role="dialog"] {
            animation: help-in 220ms ${EASE_OUT} both;
          }
          @keyframes help-in {
            from {
              opacity: 0;
              transform: scale(0.97);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            div[role="dialog"] {
              animation: none;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
