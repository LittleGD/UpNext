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

/**
 * PolaroidFrame4 — Figma `p-frame4` 기반, 장식은 역할 기반 자산으로 교체.
 *
 * 프레임: 184 × 224 (1x) → 300px 폭 기준 ~1.63x 업스케일 (실제 300 × 365).
 * 이미지: 154 × 157, 수평 중앙, 세로 중심 오프셋 -18.5px.
 * 장식:
 *   · 좌하단 fold (`frame-left-bottom-fold.png`, 9×19) — 프레임 모서리 밀착, mix-blend-multiply
 *   · 상단 엣지 테이프 (`frame-top-edge-tape.png`, 98×23) — 상단 우측에서 절반쯤 밖으로 삐져나옴
 *     이미지 자체에 기울기 포함 → 회전 변환 불필요
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

// 장식은 PNG 원본 픽셀 크기 그대로 — 업스케일 해상도 손실 방지
const FOLD_W = 9;
const FOLD_H = 19;
const TAPE_W = 98;
const TAPE_H = 23;
// 상단 엣지 테이프: 우측 상단에서 절반쯤 프레임 밖으로 걸침
const TAPE_LEFT = Math.round(88 * S); // ≈ 143 (프레임 우측에 가깝게)
const TAPE_TOP = -Math.round(TAPE_H / 2); // ≈ -12 (절반 밖)

export default function PolaroidFrame4({ imageSrc, timestamp, children }: Props) {
  // 경과 일수 기반 빈티지 에이징 — 3일 간격 step, 21일에서 최대.
  // Date.now() 를 mount 후 한 번 계산해 SSR/hydration 불일치 회피 (초기 SSR 은 opacity 0).
  const [vintageOpacity, setVintageOpacity] = useState(0);
  useEffect(() => {
    setVintageOpacity(computeVintageOpacity(timestamp));
  }, [timestamp]);
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
        borderBottom: "1px solid #423F3C",
        overflow: "hidden",
      }}
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

      {/* 좌하단 모서리 fold — 방향이 PNG에 포함 */}
      <img
        src="/polaroid/frame-left-bottom-fold.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute pointer-events-none block"
        style={{
          left: 0,
          bottom: 0,
          width: FOLD_W,
          height: FOLD_H,
          mixBlendMode: "multiply",
        }}
      />

      {/* 상단 엣지 테이프 — 이미지 자체에 기울기 포함, 회전 없음 */}
      <img
        src="/polaroid/frame-top-edge-tape.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute pointer-events-none block"
        style={{
          left: TAPE_LEFT,
          top: TAPE_TOP,
          width: TAPE_W,
          height: TAPE_H,
        }}
      />

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
