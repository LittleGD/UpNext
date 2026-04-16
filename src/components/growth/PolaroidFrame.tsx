"use client";

import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";

interface Props {
  imageSrc: string;
  timestamp: number;
  variant?: number; // 0-3, 생략 시 timestamp에서 자동 결정
  children?: React.ReactNode; // 서명 캔버스 슬롯
}

// 4가지 빈티지 폴라로이드 프레임 스타일
const FRAME_STYLES = [
  // 0: 세월이 느껴지는 빈티지 — 어두운 가장자리, 누런 톤
  {
    bg: "#e8e3d6",
    shadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 0 20px rgba(0,0,0,0.06)",
    overlay: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.08) 100%)",
  },
  // 1: 깨끗한 화이트 — 새 폴라로이드
  {
    bg: "#f8f7f4",
    shadow: "0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)",
    overlay: "none",
  },
  // 2: 마스킹 테이프 — 하단에 테이프 장식
  {
    bg: "#f5f2eb",
    shadow: "0 4px 14px rgba(0,0,0,0.18)",
    overlay: "none",
    tape: true,
  },
  // 3: 스크래치 — 사용감 있는 프레임
  {
    bg: "#ede8df",
    shadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4)",
    overlay: "none",
    scratches: true,
  },
] as const;

export default function PolaroidFrame({ imageSrc, timestamp, variant, children }: Props) {
  const v = variant ?? (timestamp % 4);
  const style = FRAME_STYLES[v];

  // 필름 카메라 날짜 스탬프
  const d = new Date(timestamp);
  const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="rounded-[3px] mx-auto max-w-[300px] relative"
      style={{ backgroundColor: style.bg, boxShadow: style.shadow }}
    >
      {/* 프레임 오버레이 (빈티지 효과) */}
      {style.overlay !== "none" && (
        <div
          className="absolute inset-0 rounded-[3px] pointer-events-none z-10"
          style={{ background: style.overlay }}
        />
      )}

      {/* 스크래치 효과 (variant 3) */}
      {"scratches" in style && style.scratches && (
        <div className="absolute inset-0 rounded-[3px] pointer-events-none z-10 overflow-hidden">
          <div
            className="absolute w-[60%] h-px rotate-[-8deg]"
            style={{ bottom: "25%", left: "10%", backgroundColor: "rgba(0,0,0,0.04)" }}
          />
          <div
            className="absolute w-[40%] h-px rotate-[5deg]"
            style={{ bottom: "35%", right: "5%", backgroundColor: "rgba(0,0,0,0.03)" }}
          />
          <div
            className="absolute w-8 h-8 rounded-full"
            style={{ bottom: "15%", left: "20%", border: "0.5px solid rgba(0,0,0,0.04)" }}
          />
        </div>
      )}

      {/* 사진 영역 */}
      <div className="relative m-[10px] mb-0 overflow-hidden">
        <img
          src={imageSrc}
          alt=""
          className="w-full aspect-square object-cover block"
          draggable={false}
          style={{ filter: KODAK_FILM_FILTER }}
        />
        {/* 필름 그레인 — SVG 터뷸런스 노이즈 overlay 블렌드 */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: FILM_GRAIN_URL,
            backgroundSize: "160px 160px",
            opacity: 0.32,
          }}
        />
        {/* 빈티지 비네팅 — 가장자리 어두워짐 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: VINTAGE_VIGNETTE }}
        />
        {/* 미묘한 인셋 섀도우 — 프레임 밀착감 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: "inset 0 0 10px rgba(0,0,0,0.15)",
          }}
        />
        {/* 날짜 스탬프 — 필름 카메라 스타일 */}
        <div
          className="absolute bottom-2 right-2 font-mono tabular-nums tracking-wider"
          style={{
            fontSize: 11,
            color: "#ff6b35",
            textShadow: "0 0 4px rgba(255,107,53,0.5)",
            fontFamily: "'Courier New', monospace",
            letterSpacing: "0.08em",
          }}
        >
          {dateStr} {timeStr}
        </div>
      </div>

      {/* 서명 영역 (하단 흰 여백) */}
      <div className="px-[10px] pt-2 pb-4 min-h-[60px] relative">
        {children}
      </div>

      {/* 마스킹 테이프 (variant 2) */}
      {"tape" in style && style.tape && (
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[70%] h-6 rounded-sm z-20 pointer-events-none"
          style={{
            backgroundColor: "#e5dcc8",
            opacity: 0.85,
            transform: "translateX(-50%) rotate(-1deg)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        />
      )}
    </div>
  );
}
