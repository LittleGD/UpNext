"use client";

import { motion } from "framer-motion";
import UpNextLogoMark from "./UpNextLogoMark";

/**
 * 폴라로이드 데코레이션 툴바 — 잉크 색상 + 펜 굵기 + 스티커 팔레트.
 *
 * 디자인 결정:
 *  - 컴팩트 가로 행 (스크롤 가능) — 폴라로이드 아래 배치
 *  - 잉크 색 5종 (검정/빨강/파랑/초록/보라) — 폴라로이드 데코 레퍼런스 톤
 *  - 펜 굵기 3 단계 (Thin/Normal/Thick)
 *  - 스티커 7종: ❤️ ⭐ ✨ 🎉 😊 🔥 + UpNext 로고
 *  - 탭하면 즉시 적용/추가 (별도 모드 전환 없음)
 */

export const INK_COLORS = [
  "rgba(22,18,14,0.92)",  // 따뜻한 검정 (default 잉크)
  "rgba(220,38,38,0.92)", // 빨강 (마커 펜)
  "rgba(30,64,175,0.92)", // 파랑 (볼펜)
  "rgba(5,150,105,0.92)", // 초록
  "rgba(124,58,237,0.92)", // 보라
] as const;

export const PEN_WIDTHS = [
  { id: "thin", label: "S", multiplier: 0.6, dotSize: 4 },
  { id: "normal", label: "M", multiplier: 1.0, dotSize: 7 },
  { id: "thick", label: "L", multiplier: 1.5, dotSize: 10 },
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
  selectedWidth: number; // multiplier (0.6, 1.0, 1.5)
  onWidthChange: (multiplier: number) => void;
  onAddSticker: (type: "emoji" | "image", content: string) => void;
}

export default function DecorationToolbar({
  selectedColor,
  onColorChange,
  selectedWidth,
  onWidthChange,
  onAddSticker,
}: Props) {
  return (
    <div className="w-full max-w-[300px] mx-auto rounded-xl bg-bg-elevated/90 backdrop-blur-sm p-2 flex flex-col gap-2">
      {/* 잉크 색상 + 펜 굵기 한 행 */}
      <div className="flex items-center gap-2 justify-center">
        <span className="typo-micro text-text-tertiary">Ink</span>
        <div className="flex items-center gap-1.5">
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

        {/* 세로 구분선 */}
        <div className="w-px h-5 bg-text-tertiary/15 mx-1" />

        {/* 펜 굵기 토글 — dot 크기로 시각 표현 */}
        <div className="flex items-center gap-1.5">
          {PEN_WIDTHS.map((w) => {
            const isSelected = w.multiplier === selectedWidth;
            return (
              <button
                key={w.id}
                onClick={() => onWidthChange(w.multiplier)}
                aria-label={`Pen width ${w.label}`}
                className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{
                  boxShadow: isSelected
                    ? "0 0 0 1.5px var(--accent-primary)"
                    : undefined,
                }}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: w.dotSize,
                    height: w.dotSize,
                    backgroundColor: selectedColor,
                  }}
                />
              </button>
            );
          })}
        </div>
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
            className="h-8 rounded-md flex items-center justify-center text-lg active:scale-90 transition-transform hover:bg-text-tertiary/10"
            style={{
              minWidth: s.id === "upnext" ? 48 : 32,
              padding: s.id === "upnext" ? "0 6px" : 0,
            }}
          >
            {s.type === "emoji" ? (
              <span>{s.content}</span>
            ) : (
              <div className="flex items-center justify-center bg-white rounded px-1 py-0.5">
                <UpNextLogoMark width={36} color="#212727" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
