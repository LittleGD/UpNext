"use client";

import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯 — 폴라로이드 하단
}

/**
 * PolaroidFrame1 — Figma `p-frame1` (node 346:2605) 충실 구현.
 *
 * Figma 원본 수치 (1x, 184 × 223):
 *   프레임: bg #e8e7e3, radius 4, border-bottom 1px solid #e8e7e3, overflow hidden
 *   이미지 슬롯 (Frame 39, node 346:2606): 154 × 157, 수평 중앙, 세로 중심 오프셋 -18.5px
 *     → 수식: top = 50% - 18.5px 에서 이미지 높이의 절반을 빼면 실제 top = 14.5 ≈ 14px
 *     → 즉 이미지 좌표 (15, 14) — 프레임 4/5 와 동일한 사진 슬롯 크기
 *   Polygon 3 (node 346:2609) — 좌상단 모서리 삼각형 스티커:
 *     36×36 flex 컨테이너 (mix-blend-multiply) at (-16.5, -16.5)
 *     내부 25.456px 박스를 -45° 회전 → 삼각형이 프레임 안쪽(우하)을 향함
 *     inset: top 0, bottom 25%, left/right 6.7% (Figma 스펙 그대로)
 *
 * 300px 너비로 스케일 업 (300 / 184 ≈ 1.6304x) → 실제 렌더: 300 × 363.6px.
 * 좌표/크기 전부 동일 배율로 스케일하여 비율 보존.
 */

const S = 300 / 184; // ≈ 1.6304

// 프레임 실제 크기
const FRAME_W = 300;
const FRAME_H = 223 * S; // ≈ 363.59

// 이미지 슬롯 (Figma: 154×157, 수평 중앙, top = 50% - 18.5px - 157/2)
const IMG_W = 154 * S;
const IMG_H = 157 * S;
const IMG_LEFT = (FRAME_W - IMG_W) / 2; // 수평 중앙
const IMG_TOP = FRAME_H / 2 - 18.5 * S - IMG_H / 2; // 세로 중앙에서 18.5*S 위로 오프셋

// 캡션 슬롯 (이미지 아래 ~ 프레임 하단)
const CAPTION_LEFT = IMG_LEFT;
const CAPTION_TOP = IMG_TOP + IMG_H;
const CAPTION_W = IMG_W;
const CAPTION_H = FRAME_H - CAPTION_TOP;

// Polygon 3 — 좌상단 삼각형 스티커 (mix-blend-multiply, -45° 회전)
const POLY_WRAP = 36 * S; // flex 컨테이너 (회전 전 36×36)
const POLY_LEFT = -16.5 * S;
const POLY_TOP = -16.5 * S;
const POLY_INNER = 25.456 * S; // 내부 relative 박스 (회전됨)

export default function PolaroidFrame1({ imageSrc, timestamp, children }: Props) {
  // 필름 카메라 날짜 스탬프 — 'YY MM DD HH:MM (기존 PolaroidFrame.tsx 포맷 그대로)
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
      data-node-id="346:2605"
      data-name="p-frame1"
    >
      {/* 사진 영역 — 검은 배경 + 이미지 + 필터 레이어 */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: IMG_LEFT,
          top: IMG_TOP,
          width: IMG_W,
          height: IMG_H,
          backgroundColor: "#010101",
        }}
        data-node-id="346:2606"
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
        {/* 날짜 스탬프 — 필름 카메라 스타일 (우하단 오렌지) */}
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

      {/* 캡션/서명 영역 — 이미지 하단 베이지 립 */}
      <div
        className="absolute"
        style={{
          left: CAPTION_LEFT,
          top: CAPTION_TOP,
          width: CAPTION_W,
          height: CAPTION_H,
        }}
      >
        {children}
      </div>

      {/* 좌상단 폴리곤 스티커 — mix-blend-multiply, -45° 회전 */}
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          left: POLY_LEFT,
          top: POLY_TOP,
          width: POLY_WRAP,
          height: POLY_WRAP,
          mixBlendMode: "multiply",
        }}
      >
        <div
          className="flex-none"
          style={{ transform: "rotate(-45deg)" }}
        >
          <div
            className="relative"
            style={{ width: POLY_INNER, height: POLY_INNER }}
            data-node-id="346:2609"
          >
            {/* Figma 스펙: 삼각형은 상단 기준 높이 75% 차지 (bottom 25%), 좌우 6.7% 인셋 */}
            <div
              className="absolute"
              style={{
                top: 0,
                bottom: "25%",
                left: "6.7%",
                right: "6.7%",
              }}
            >
              <img
                src="/polaroid/frame1/polygon3.png"
                alt=""
                draggable={false}
                className="block w-full h-full"
                style={{ maxWidth: "none" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
