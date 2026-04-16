"use client";

import { useEffect, useState } from "react";
import {
  KODAK_FILM_FILTER,
  FILM_GRAIN_URL,
  VINTAGE_VIGNETTE,
  VINTAGE_AMBER,
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
const S = 300 / 184; // ≈ 1.6304
const FRAME_W = 184 * S; // 300
const FRAME_H = 223 * S; // ≈ 363.59

// 이미지 슬롯
const IMG_LEFT = 15 * S;
const IMG_TOP = 14 * S;
const IMG_W = 154 * S;
const IMG_H = 157 * S;

// 하단 캡션 영역
const CAP_LEFT = 15 * S;
const CAP_TOP = (14 + 157) * S; // 171 * S
const CAP_W = 154 * S;
const CAP_H = (223 - 171) * S; // 52 * S

// 장식은 PNG 원본 픽셀 크기 그대로 — 업스케일 해상도 손실 방지
const FOLD_W = 13;
const FOLD_H = 12;
const CRACK_W = 141;
const CRACK_H = 21;

// 크랙은 사진 하단~캡션 경계를 가로지르며 좌측 밖까지 살짝 뻗는 위치
// Figma 원본 y=189 위치(프레임의 약 84.8%)에 배치
const CRACK_LEFT = -16; // 좌측에서 살짝 프레임 밖
const CRACK_TOP = Math.round(189 * S); // ≈ 308 — 사진 하단 엣지 근처

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
      className="mx-auto relative overflow-hidden"
      style={{
        width: FRAME_W,
        height: FRAME_H,
        backgroundColor: "#e8e7e3",
        borderBottom: "1px solid #423F3C",
        borderRadius: 4,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
      }}
      data-node-id="346:2616"
      data-name="p-frame3"
    >
      {/* 종이 질감 그레인 — 프레임 여백에 옅게 깔림 (사진은 위에 덮여 그레인이 안 보임) */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: FILM_GRAIN_URL,
          backgroundSize: "160px 160px",
          opacity: 0.15,
          mixBlendMode: "multiply",
        }}
      />
      {/* 이미지 슬롯 (Frame 39) */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: IMG_LEFT,
          top: IMG_TOP,
          width: IMG_W,
          height: IMG_H,
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
        {/* 미묘한 인셋 섀도우 — 프레임 밀착감 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 10px rgba(0,0,0,0.15)" }}
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
          top: CRACK_TOP,
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
          left: CAP_LEFT,
          top: CAP_TOP,
          width: CAP_W,
          height: CAP_H,
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
    </div>
  );
}
