"use client";

import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯 — 폴라로이드 하단
}

/**
 * PolaroidFrame4 — Figma `p-frame4` 재현 (node 346:2622).
 *
 * Figma 원본 수치 (1x):
 *   프레임: 184 × 224 (bg #e8e7e3, radius 4, border-bottom solid #e8e7e3)
 *   이미지: 154 × 157, 수평 중앙, 세로 중심 오프셋 -18.5px
 *   폴리곤3 (좌하단 장식): 26×26, left -15px / top 204px, rotate 1.34deg, mix-blend-multiply
 *   렉탱글38 (상단 테이프): 99.5 × 20.2 (랩 98 × 48 with rotate), left 86 / top -24, rotate 17.06deg
 *
 * 300px 너비로 스케일 업 (≈ 1.63x) → 실제 렌더: 300 × 365.
 */

// 스케일 계수 (Figma 1x → 렌더 px)
const S = 300 / 184;

// 프레임 실제 크기
const FRAME_W = 300;
const FRAME_H = Math.round(224 * S); // ≈ 365

// 이미지 슬롯
const IMG_W = Math.round(154 * S); // ≈ 251
const IMG_H = Math.round(157 * S); // ≈ 256
const IMG_LEFT = Math.round((FRAME_W - IMG_W) / 2); // ≈ 24
const IMG_TOP = Math.round(FRAME_H / 2 - 18.5 * S - IMG_H / 2); // ≈ 25

// 캡션 슬롯 (이미지 아래 ~ 프레임 하단)
const CAPTION_TOP = IMG_TOP + IMG_H;
const CAPTION_H = FRAME_H - CAPTION_TOP;

// 데코 — 좌하단 폴리곤 (mix-blend-multiply)
const POLY_SIZE = Math.round(26.043 * S); // ≈ 42
const POLY_LEFT = Math.round(-15.02 * S); // ≈ -24
const POLY_TOP = Math.round(203.98 * S); // ≈ 333

// 데코 — 상단 테이프
const TAPE_W = Math.round(99.521 * S); // ≈ 162
const TAPE_H = Math.round(48.03 * S); // ≈ 78 (회전 컨테이너)
const TAPE_INNER_W = Math.round(97.902 * S); // ≈ 160
const TAPE_INNER_H = Math.round(20.203 * S); // ≈ 33
const TAPE_LEFT = Math.round(86 * S); // ≈ 140
const TAPE_TOP = Math.round(-24 * S); // ≈ -39

export default function PolaroidFrame4({ imageSrc, timestamp, children }: Props) {
  // 필름 카메라 날짜 스탬프 — 'YY MM DD HH:MM
  const d = new Date(timestamp);
  const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="mx-auto relative"
      style={{
        width: FRAME_W,
        height: FRAME_H,
        backgroundColor: "#e8e7e3",
        borderRadius: 4,
        borderBottom: "1px solid #e8e7e3",
        overflow: "hidden",
      }}
    >
      {/* 사진 영역 — Figma 검정 사각형 위치에 배치 */}
      <div
        className="absolute overflow-hidden"
        style={{
          width: IMG_W,
          height: IMG_H,
          left: IMG_LEFT,
          top: IMG_TOP,
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
          style={{ boxShadow: "inset 0 0 10px rgba(0,0,0,0.15)" }}
        />
        {/* 날짜 스탬프 — 필름 카메라 스타일 */}
        <div
          className="absolute tabular-nums"
          style={{
            right: 8,
            bottom: 8,
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

      {/* 캡션/서명 영역 — 이미지 하단 */}
      <div
        className="absolute"
        style={{
          left: IMG_LEFT,
          top: CAPTION_TOP,
          width: IMG_W,
          height: CAPTION_H,
        }}
      >
        {children}
      </div>

      {/* 좌하단 데코 — polygon3 (mix-blend-multiply, 1.34deg 회전) */}
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          left: POLY_LEFT,
          top: POLY_TOP,
          width: POLY_SIZE,
          height: POLY_SIZE,
          mixBlendMode: "multiply",
        }}
      >
        <div style={{ transform: "rotate(1.34deg)", width: POLY_SIZE, height: POLY_SIZE }}>
          <img
            src="/polaroid/frame4/polygon3.png"
            alt=""
            className="block w-full h-full"
            draggable={false}
          />
        </div>
      </div>

      {/* 상단 우측 테이프 — rectangle38 (17.06deg 회전) */}
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          left: TAPE_LEFT,
          top: TAPE_TOP,
          width: TAPE_W,
          height: TAPE_H,
        }}
      >
        <div
          style={{
            transform: "rotate(17.06deg)",
            width: TAPE_INNER_W,
            height: TAPE_INNER_H,
          }}
        >
          <img
            src="/polaroid/frame4/rectangle38.png"
            alt=""
            className="block w-full h-full"
            draggable={false}
            style={{
              // Figma inset [-3.62% -0.26% -3.6% -0.76%] 재현 — 살짝 확장
              width: "calc(100% + 1.02%)",
              height: "calc(100% + 7.22%)",
              marginLeft: "-0.76%",
              marginTop: "-3.62%",
              maxWidth: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
