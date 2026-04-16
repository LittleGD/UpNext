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
 * PolaroidFrame5 — 장식 없는 기본 흰색 폴라로이드.
 *
 * 프레임: 184×223 (1x) → 300px 폭 스케일 업 (~1.63x).
 * 사진 슬롯: Frame1과 동일 — 154×157, 수평 중앙, 세로 중심 -18.5px 오프셋.
 * 배경: #ffffff (순백), border-bottom: 1px solid #423F3C (어두운 라인 — 종이 두께감).
 * 장식 없음 — "기본형" 카드, 특별한 날이나 일반 기록용으로 사용 가능.
 */

const S = 300 / 184; // ≈ 1.6304

// 프레임 실제 크기
const FRAME_W = 300;
const FRAME_H = 223 * S; // ≈ 363.59

// 이미지 슬롯 (Frame1과 동일 규격)
const IMG_W = 154 * S;
const IMG_H = 157 * S;
const IMG_LEFT = (FRAME_W - IMG_W) / 2; // 수평 중앙
const IMG_TOP = FRAME_H / 2 - 18.5 * S - IMG_H / 2; // 세로 중앙에서 18.5*S 위로 오프셋

// 캡션 슬롯 (이미지 아래 ~ 프레임 하단)
const CAPTION_LEFT = IMG_LEFT;
const CAPTION_TOP = IMG_TOP + IMG_H;
const CAPTION_W = IMG_W;
const CAPTION_H = FRAME_H - CAPTION_TOP;

export default function PolaroidFrame5({ imageSrc, timestamp, children }: Props) {
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
        backgroundColor: "#ffffff",
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

      {/* 캡션/서명 영역 — 이미지 하단 흰 여백 */}
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
