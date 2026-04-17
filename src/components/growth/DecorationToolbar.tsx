"use client";

import { motion } from "framer-motion";

/**
 * 폴라로이드 데코레이션 툴바 — 잉크 색상 + 스티커 팔레트.
 *
 * 디자인 결정:
 *  - 컴팩트 가로 행 (스크롤 가능) — 폴라로이드 아래 배치
 *  - 잉크 색 5종 (검정/빨강/파랑/초록/보라) — 폴라로이드 데코 레퍼런스 톤
 *  - 스티커: 자주 쓰이는 이모지 6개 + UpNext 로고
 *  - 탭하면 즉시 적용/추가 (별도 모드 전환 없음)
 *
 * 향후: 펜 굵기, 지우개 토글, 더 많은 스티커 카테고리
 */

export const INK_COLORS = [
  "rgba(22,18,14,0.92)",  // 따뜻한 검정 (default 잉크)
  "rgba(220,38,38,0.92)", // 빨강 (마커 펜)
  "rgba(30,64,175,0.92)", // 파랑 (볼펜)
  "rgba(5,150,105,0.92)", // 초록
  "rgba(124,58,237,0.92)", // 보라
] as const;

export const STICKER_PRESETS = [
  { id: "heart", type: "emoji" as const, content: "❤️" },
  { id: "star", type: "emoji" as const, content: "⭐" },
  { id: "sparkles", type: "emoji" as const, content: "✨" },
  { id: "party", type: "emoji" as const, content: "🎉" },
  { id: "smile", type: "emoji" as const, content: "😊" },
  { id: "fire", type: "emoji" as const, content: "🔥" },
  { id: "upnext", type: "image" as const, content: "upnext-logo" },
] as const;

interface Props {
  selectedColor: string;
  onColorChange: (color: string) => void;
  onAddSticker: (type: "emoji" | "image", content: string) => void;
}

export default function DecorationToolbar({
  selectedColor,
  onColorChange,
  onAddSticker,
}: Props) {
  return (
    <div className="w-full max-w-[300px] mx-auto rounded-xl bg-bg-elevated/90 backdrop-blur-sm p-2 flex flex-col gap-2">
      {/* 잉크 색상 */}
      <div className="flex items-center gap-1.5 justify-center">
        <span className="typo-micro text-text-tertiary mr-1">Ink</span>
        {INK_COLORS.map((color) => {
          const isSelected = color === selectedColor;
          return (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              aria-label={`Pen color ${color}`}
              className="relative w-6 h-6 rounded-full active:scale-90 transition-transform"
              style={{
                backgroundColor: color,
                boxShadow: isSelected
                  ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${color}`
                  : "0 1px 2px rgba(0,0,0,0.3)",
              }}
            >
              {isSelected && (
                <motion.span
                  layoutId="ink-selected-ring"
                  className="absolute inset-0 rounded-full"
                  initial={false}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 구분선 */}
      <div className="h-px bg-text-tertiary/10" />

      {/* 스티커 팔레트 */}
      <div className="flex items-center gap-2 justify-center overflow-x-auto">
        <span className="typo-micro text-text-tertiary mr-1 shrink-0">Sticker</span>
        {STICKER_PRESETS.map((s) => (
          <button
            key={s.id}
            onClick={() => onAddSticker(s.type, s.content)}
            aria-label={`Add ${s.id} sticker`}
            className="w-8 h-8 rounded-md flex items-center justify-center text-lg active:scale-90 transition-transform hover:bg-text-tertiary/10"
          >
            {s.type === "emoji" ? (
              <span>{s.content}</span>
            ) : (
              <UpNextMark size={20} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** UpNext 로고 마크 — 스티커용 컴팩트 N */
function UpNextMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="0" y="0" width="32" height="32" rx="6" fill="#cdf564" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontWeight="700"
        fontSize="18"
        fill="#212727"
      >
        N
      </text>
    </svg>
  );
}
