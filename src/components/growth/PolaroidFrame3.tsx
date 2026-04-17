"use client";

import { useEffect, useState } from "react";
import {
  KODAK_FILM_FILTER,
  FILM_GRAIN_URL,
  PAPER_FIBER_URL,
  VINTAGE_VIGNETTE,
  VINTAGE_AMBER,
  FRAME_DROP_SHADOW,
  FRAME_EDGE_SHADOW,
  PHOTO_RECESS_SHADOW,
  BOTTOM_EMBOSS_PATTERN,
  FRAME_REFLECTION,
  computeVintageOpacity,
} from "@/lib/photoFilter";

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode; // 서명/캡션 캔버스 슬롯 — 폴라로이드 하단
}

// Figma p-frame3 기반 (184 x 223), 장식은 역할 기반 자산으로 교체
// - 이미지 슬롯(Frame 39): 154 x 157 @ (15, 14)
// - 하단 캡션 영역: (15, 171) ~ (169, 223) — 52px 높이
// - 장식:
//   · 우하단 fold (`frame-right-bottom-fold.png`, 13×12) — 프레임 모서리 밀착, mix-blend-multiply
//   · 사진 하단 크랙 (`frame-crack.png`, 141×21) — 좌측 밖까지 뻗는 얇은 균열
//
// 렌더 시 ~300px 폭으로 확대 (300 / 184 ≈ 1.6304).
// Figma 원본 좌표 (184×223 기준) → 퍼센트로 변환해 반응형 스케일
// 사진 영역: x=15 / y=14 / 154×157
const photoLeftPct = (15 / 184) * 100; // 8.152%
const photoTopPct = (14 / 223) * 100; // 6.278%
const photoWidthPct = (154 / 184) * 100; // 83.696%
const photoHeightPct = (157 / 223) * 100; // 70.404%

// 캡션 영역: 이미지 바로 아래 ~ 프레임 하단
const captionTopPct = ((14 + 157) / 223) * 100; // 76.682%
const captionHeightPct = ((223 - 171) / 223) * 100; // 23.318%

// 장식은 PNG 원본 픽셀 크기 그대로 — 업스케일 해상도 손실 방지
const FOLD_W = 13;
const FOLD_H = 12;
const CRACK_W = 141;
const CRACK_H = 21;

// 크랙은 사진 하단~캡션 경계를 가로지르며 좌측 밖까지 살짝 뻗는 위치
// Figma 원본 y=189 위치(프레임의 약 84.8%)에 배치
const CRACK_LEFT = -16; // 좌측에서 살짝 프레임 밖
const crackTopPct = (189 / 223) * 100; // 84.753%

export default function PolaroidFrame3({ imageSrc, timestamp, children }: Props) {
  // 경과 일수 기반 빈티지 에이징 — 3일 간격 step, 21일에서 최대.
  // Date.now() 를 mount 후 한 번 계산해 SSR/hydration 불일치 회피 (초기 SSR 은 opacity 0).
  const [vintageOpacity, setVintageOpacity] = useState(0);
  useEffect(() => {
    setVintageOpacity(computeVintageOpacity(timestamp));
  }, [timestamp]);
  // 필름 카메라 날짜 스탬프 (기존 PolaroidFrame.tsx 포맷 그대로)
  const d = new Date(timestamp);
  const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="mx-auto max-w-[300px] w-full relative overflow-hidden"
      style={{
        aspectRatio: "184 / 223",
        backgroundColor: "#f2f1ee",
        borderRadius: 2,
        boxShadow: FRAME_DROP_SHADOW,
      }}
      data-node-id="346:2616"
      data-name="p-frame3"
    >
      {/* 미세 그레인 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: FILM_GRAIN_URL,
          backgroundSize: "160px 160px",
          opacity: 0.18,
          mixBlendMode: "multiply",
        }}
      />
      {/* 거친 종이 섬유질 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: PAPER_FIBER_URL,
          backgroundSize: "200px 200px",
          opacity: 0.08,
          mixBlendMode: "multiply",
        }}
      />
      {/* 프레임 가장자리 어두움 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: FRAME_EDGE_SHADOW }}
      />
      {/* 하단 엠보스 패턴 */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: 0,
          right: 0,
          top: `${captionTopPct}%`,
          bottom: 0,
          background: BOTTOM_EMBOSS_PATTERN,
        }}
      />
      {/* 이미지 슬롯 (Frame 39) */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: `${photoLeftPct}%`,
          top: `${photoTopPct}%`,
          width: `${photoWidthPct}%`,
          height: `${photoHeightPct}%`,
          backgroundColor: "#010101",
        }}
        data-node-id="346:2617"
      >
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          className="block w-full h-full object-cover"
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
        {/* 빈티지 비네팅 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: VINTAGE_VIGNETTE }}
        />
        {/* 사진 리세스 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: PHOTO_RECESS_SHADOW }}
        />
        {/* 날짜 스탬프 — 필름 카메라 스타일 (우하단 오렌지) */}
        <div
          className="absolute bottom-2 right-2 tabular-nums"
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

      {/* 크랙 — 사진 하단~캡션 경계를 따라 좌측 밖까지 뻗는 얇은 균열 */}
      <img
        src="/polaroid/frame-crack.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute pointer-events-none block"
        style={{
          left: CRACK_LEFT,
          top: `${crackTopPct}%`,
          width: CRACK_W,
          height: CRACK_H,
          mixBlendMode: "multiply",
          opacity: 0.7,
        }}
      />

      {/* 우하단 모서리 fold — 방향이 PNG에 포함 */}
      <img
        src="/polaroid/frame-right-bottom-fold.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute pointer-events-none block"
        style={{
          right: 0,
          bottom: 0,
          width: FOLD_W,
          height: FOLD_H,
          mixBlendMode: "multiply",
        }}
      />

      {/* 서명/캡션 슬롯 — 폴라로이드 하단 흰 여백 */}
      <div
        className="absolute"
        style={{
          left: `${photoLeftPct}%`,
          top: `${captionTopPct}%`,
          width: `${photoWidthPct}%`,
          height: `${captionHeightPct}%`,
        }}
      >
        {children}
      </div>

      {/* 빈티지 에이징 오버레이 — 21일에 걸쳐 누렇게 바래지는 앰버 레이어 */}
      {vintageOpacity > 0 && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: VINTAGE_AMBER,
            opacity: vintageOpacity,
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* 표면 반사광 — 광택 인화지의 대각선 글로스 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: FRAME_REFLECTION }}
      />
    </div>
  );
}
