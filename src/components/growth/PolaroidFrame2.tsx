"use client";

import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯 — 폴라로이드 하단
}

/**
 * PolaroidFrame2 — Figma `p-frame2` (node 346:2611) 충실 구현
 *
 * 원본 프레임: 184×223 — max-width 300px 기준으로 ~1.63배 업스케일.
 * 구성:
 *  - 베이지 카드(#e8e7e3, rounded 4px, overflow-hidden)
 *  - 검은 사진 영역: 원본 좌표 x=15/y=14/154×157 (비율 기준 offset)
 *  - 우상단 모서리에 걸친 폴리곤 스티커(polygon3.png, 18.66° 회전, mix-blend-multiply)
 *  - 좌하단에 걸친 마스킹 테이프(rectangle38.png, -4.38° 회전)
 *  - 사진 영역 내부: Kodak 필터 + 필름 그레인 + 비네트 + 인셋 섀도우 + 오렌지 날짜 스탬프
 *  - children 슬롯: 사진 아래 베이지 립 영역
 */
export default function PolaroidFrame2({ imageSrc, timestamp, children }: Props) {
  // 필름 카메라 날짜 스탬프 — 기존 PolaroidFrame.tsx 포맷 그대로
  const d = new Date(timestamp);
  const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // Figma 원본 좌표 (184×223 기준) → 퍼센트로 변환해 업스케일에도 비율 유지
  // 사진 영역: x=15/y=14, w=154, h=157
  const photoLeftPct = (15 / 184) * 100; // 8.152%
  const photoTopPct = (14 / 223) * 100; // 6.278%
  const photoWidthPct = (154 / 184) * 100; // 83.696%
  const photoHeightPct = (157 / 223) * 100; // 70.404%

  // Polygon 3 스티커: x=170.01, y=-19.13, size=32.26, rotate 18.66deg
  const polyLeftPct = (170.01 / 184) * 100; // 92.4%
  const polyTopPct = (-19.13 / 223) * 100; // -8.58%
  const polySizePct = (32.26 / 184) * 100; // 17.53% of frame width

  // Rectangle 38 마스킹 테이프: x=-6, y=189.97, 156.99×43.76, rotate -4.38deg
  const tapeLeftPct = (-6 / 184) * 100; // -3.26%
  const tapeTopPct = (189.97 / 223) * 100; // 85.19%
  const tapeWidthPct = (156.99 / 184) * 100; // 85.32%
  const tapeHeightPct = (43.76 / 223) * 100; // 19.62%

  return (
    <div
      className="mx-auto max-w-[300px] w-full relative overflow-hidden"
      style={{
        aspectRatio: "184 / 223",
        backgroundColor: "#e8e7e3",
        borderBottom: "1px solid #e8e7e3",
        borderRadius: 4,
      }}
    >
      {/* 사진 영역 (검은 배경 + 이미지 + 필터 레이어) */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: `${photoLeftPct}%`,
          top: `${photoTopPct}%`,
          width: `${photoWidthPct}%`,
          height: `${photoHeightPct}%`,
          backgroundColor: "#010101",
        }}
      >
        <img
          src={imageSrc}
          alt=""
          className="w-full h-full object-cover block"
          draggable={false}
          style={{ filter: KODAK_FILM_FILTER }}
        />
        {/* 필름 그레인 */}
        <div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: FILM_GRAIN_URL,
            backgroundSize: "160px 160px",
            opacity: 0.32,
          }}
        />
        {/* 빈티지 비네팅 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: VINTAGE_VIGNETTE }}
        />
        {/* 인셋 섀도우 — 프레임 밀착감 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 10px rgba(0,0,0,0.15)" }}
        />
        {/* 오렌지 날짜 스탬프 — 필름 카메라 스타일 */}
        <div
          className="absolute bottom-2 right-2 font-mono tabular-nums"
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

      {/* 서명/캡션 슬롯 — 사진 아래 베이지 립 영역 */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: `${photoTopPct + photoHeightPct}%`,
          bottom: 0,
          padding: "6px 12px",
        }}
      >
        {children}
      </div>

      {/* Polygon 3 — 우상단 모서리 스티커 (mix-blend-multiply, 18.66° 회전) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${polyLeftPct}%`,
          top: `${polyTopPct}%`,
          width: `${polySizePct}%`,
          aspectRatio: "1 / 1",
          transform: "rotate(18.66deg)",
          transformOrigin: "center",
          mixBlendMode: "multiply",
        }}
      >
        <img
          src="/polaroid/frame2/polygon3.png"
          alt=""
          className="block w-full h-full"
          draggable={false}
        />
      </div>

      {/* Rectangle 38 — 좌하단 마스킹 테이프 (-4.38° 회전) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${tapeLeftPct}%`,
          top: `${tapeTopPct}%`,
          width: `${tapeWidthPct}%`,
          height: `${tapeHeightPct}%`,
          transform: "rotate(-4.38deg)",
          transformOrigin: "center",
        }}
      >
        <img
          src="/polaroid/frame2/rectangle38.png"
          alt=""
          className="block w-full h-full"
          draggable={false}
        />
      </div>
    </div>
  );
}
