"use client";

import UpNextLogoMark from "./UpNextLogoMark";

/**
 * 폴라로이드 데코레이션 툴바 — 잉크 색상 + 펜 굵기 + 스티커 팔레트.
 *
 * 디자인 결정:
 *  - 컴팩트 가로 행 — 폴라로이드 아래 배치
 *  - 잉크 5종, 굵기 3단계, 스티커 7종 (UpNext 첫번째 + 이모지 6)
 *  - 라벨 제거 (가로 공간 부족 + 시각적 자명함). aria-label 로 접근성 유지
 *  - 모든 swatch 외곽에 subtle 화이트 보더 → 어두운 bg 위에서 검정 잉크도 잘 보임
 *  - 굵기 dot 색은 text-secondary 고정 (잉크 색 따라가면 검정 → 안 보임)
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

// UpNext 가 첫번째 — "내 앱 브랜드" 가 가장 먼저 (사용자 요청)
export const STICKER_PRESETS = [
  { id: "upnext", type: "image" as const, content: "upnext-logo" },
  { id: "heart", type: "emoji" as const, content: "❤️" },
  { id: "star", type: "emoji" as const, content: "⭐" },
  { id: "sparkles", type: "emoji" as const, content: "✨" },
  { id: "party", type: "emoji" as const, content: "🎉" },
  { id: "smile", type: "emoji" as const, content: "😊" },
  { id: "fire", type: "emoji" as const, content: "🔥" },
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
    <div className="w-full max-w-[300px] mx-auto rounded-xl bg-bg-elevated/90 backdrop-blur-sm p-2.5 flex flex-col gap-2.5">
      {/* 잉크 색상 + 펜 굵기 한 행 — 라벨 제거로 공간 확보 */}
      <div className="flex items-center justify-center gap-2">
        <div className="flex items-center gap-1.5">
          {INK_COLORS.map((color) => {
            const isSelected = color === selectedColor;
            // 모든 swatch: 외곽에 subtle 화이트 보더 (검정도 어두운 bg 위에서 보임).
            // 선택 시: inset 라이트 그레이 ring → 외곽 사이즈 변화 X.
            const baseShadow =
              "0 0 0 1px rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.4)";
            const insetRing = "inset 0 0 0 2px rgba(220,220,220,0.95)";
            return (
              <button
                key={color}
                onClick={() => onColorChange(color)}
                aria-label={`Pen color ${color}`}
                className="relative w-6 h-6 rounded-full active:scale-90 transition-transform"
                style={{
                  backgroundColor: color,
                  boxShadow: isSelected ? `${insetRing}, ${baseShadow}` : baseShadow,
                }}
              />
            );
          })}
        </div>

        {/* 세로 구분선 */}
        <div className="w-px h-5 bg-text-tertiary/15 mx-1" />

        {/* 펜 굵기 토글 — dot 색은 항상 text-secondary (잉크 색 따라가면 검정 → 안 보임) */}
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
                    ? "inset 0 0 0 1.5px var(--accent-primary)"
                    : undefined,
                }}
              >
                <span
                  className="rounded-full bg-text-secondary"
                  style={{ width: w.dotSize, height: w.dotSize }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-text-tertiary/10" />

      {/* 스티커 팔레트 — UpNext 첫번째 (브랜드 우선) */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {STICKER_PRESETS.map((s) => (
          <button
            key={s.id}
            onClick={() => onAddSticker(s.type, s.content)}
            aria-label={`Add ${s.id} sticker`}
            className="h-8 rounded-md flex items-center justify-center text-lg active:scale-90 transition-transform hover:bg-text-tertiary/10"
            style={{
              minWidth: s.id === "upnext" ? 48 : 32,
              padding: s.id === "upnext" ? "0 4px" : 0,
            }}
          >
            {s.type === "emoji" ? (
              <span>{s.content}</span>
            ) : (
              <div className="flex items-center justify-center bg-white rounded px-1 py-0.5">
                <UpNextLogoMark width={32} color="#212727" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
