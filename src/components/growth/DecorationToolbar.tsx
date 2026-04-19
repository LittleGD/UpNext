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
  /** position 이 주어지면 드래그-앤-드롭 결과 (% 좌표), 없으면 탭 → 중앙 (50,50) */
  onAddSticker: (
    type: "emoji" | "image",
    content: string,
    position?: { x: number; y: number },
  ) => void;
}

export default function DecorationToolbar({
  selectedColor,
  onColorChange,
  selectedWidth,
  onWidthChange,
  onAddSticker,
}: Props) {
  /**
   * 스티커 드래그-앤-드롭:
   *  - pointerdown 부터 추적 시작
   *  - 8px 넘게 움직이면 drag 모드 진입 → ghost element 가 손가락 따라옴
   *  - pointerup 시:
   *    · drag 모드 + 폴라로이드 위 (data-sticker-target) → onAddSticker(x%, y%)
   *    · drag 모드 + 폴라로이드 밖 → 무시 (cancel)
   *    · drag 모드 아님 (그냥 tap) → onAddSticker(없이) → 중앙 (50,50) 추가
   *
   * 디자인 결정:
   *  - 같은 버튼이 tap + drag 둘 다 지원 (threshold 로 구분)
   *  - ghost 는 button 의 cloneNode — 정확히 같은 모양 보임
   *  - Pointer Events 사용 → 터치/마우스 동시 지원
   */
  const handleStickerPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    sticker: (typeof STICKER_PRESETS)[number],
  ) => {
    // 우클릭/멀티터치 무시
    if (e.button !== 0 && e.button !== undefined) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const button = e.currentTarget;
    let isDragging = false;
    let ghost: HTMLDivElement | null = null;

    const createGhost = (x: number, y: number) => {
      const g = document.createElement("div");
      g.style.position = "fixed";
      g.style.left = `${x}px`;
      g.style.top = `${y}px`;
      g.style.transform = "translate(-50%, -50%) scale(1.4)";
      g.style.pointerEvents = "none";
      g.style.zIndex = "99999";
      g.style.opacity = "0.92";
      // 버튼 내용 그대로 복제 (이모지/UpNext 로고 모두 동일하게).
      //   Phase 14 code-review High #10 — innerHTML 재할당은 re-parse 되며 향후
      //   STICKER_PRESETS 에 유저 입력 기반 content 가 들어올 경우 XSS 취약. 지금은
      //   상수 pool 이지만 방어적으로 cloneNode 로 treewise copy 하도록 변경.
      for (const child of Array.from(button.childNodes)) {
        g.appendChild(child.cloneNode(true));
      }
      // 이모지 사이즈 보정
      g.style.fontSize = "36px";
      g.style.lineHeight = "1";
      g.style.filter = "drop-shadow(0 4px 8px rgba(0,0,0,0.5))";
      return g;
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!isDragging && Math.hypot(dx, dy) > 8) {
        isDragging = true;
        ghost = createGhost(ev.clientX, ev.clientY);
        document.body.appendChild(ghost);
      }
      if (isDragging && ghost) {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      }
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      ghost?.remove();

      if (!isDragging) {
        // 그냥 tap — 중앙에 추가 (기존 동작 유지)
        onAddSticker(sticker.type, sticker.content);
        return;
      }
      // Drag — 드롭 위치가 폴라로이드 위인지 확인
      const elem = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = elem?.closest("[data-sticker-target]") as HTMLElement | null;
      if (!target) return; // 폴라로이드 밖에 떨어뜨림 → 취소
      const rect = target.getBoundingClientRect();
      const xPct = ((ev.clientX - rect.left) / rect.width) * 100;
      const yPct = ((ev.clientY - rect.top) / rect.height) * 100;
      // 클램프 — 경계 너머 살짝 떨어뜨려도 안에 들어오게
      const x = Math.max(0, Math.min(100, xPct));
      const y = Math.max(0, Math.min(100, yPct));
      onAddSticker(sticker.type, sticker.content, { x, y });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

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
                // 시각: 24×24 / 히트: 44×44 (WCAG AAA — ::after 확장. 레이아웃 변화 X)
                className="relative w-6 h-6 rounded-full active:scale-90 transition-transform after:absolute after:-inset-2.5 after:content-[''] after:rounded-full"
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
                // 시각: 24×24 / 히트: 44×44 (::after 확장)
                className="relative w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform after:absolute after:-inset-2.5 after:content-[''] after:rounded-full"
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

      {/* 스티커 팔레트 — UpNext 첫번째 (브랜드 우선).
          탭 = 중앙에 추가 / 드래그 = 폴라로이드 위 정확한 위치에 배치 */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {STICKER_PRESETS.map((s) => (
          <button
            key={s.id}
            onPointerDown={(e) => handleStickerPointerDown(e, s)}
            aria-label={`Add ${s.id} sticker (tap or drag onto polaroid)`}
            // 시각: 32H / 히트: 44H (::after 확장 — 세로 +12, 가로 +12). 드래그 시작점 판별에도 동일 box 적용.
            className="relative h-8 rounded-md flex items-center justify-center text-lg active:scale-90 transition-transform hover:bg-text-tertiary/10 touch-none after:absolute after:-inset-1.5 after:content-[''] after:rounded-md"
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
