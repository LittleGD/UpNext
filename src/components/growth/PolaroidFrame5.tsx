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

// Figma 원본 좌표 (184×223 기준) → 퍼센트로 변환해 반응형 스케일
// 사진 영역: x=15 / y=14 / 154×157
const photoLeftPct = (15 / 184) * 100; // 8.152%
const photoTopPct = (14 / 223) * 100; // 6.278%
const photoWidthPct = (154 / 184) * 100; // 83.696%
const photoHeightPct = (157 / 223) * 100; // 70.404%

// 캡션 영역: 이미지 바로 아래 ~ 프레임 하단
const captionTopPct = ((14 + 157) / 223) * 100; // 76.682%
const captionHeightPct = ((223 - 171) / 223) * 100; // 23.318%

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
      className="mx-auto max-w-[300px] w-full relative"
      style={{
        aspectRatio: "184 / 223",
        backgroundColor: "#f9f8f5",
        borderRadius: 2,
        boxShadow: FRAME_DROP_SHADOW,
        overflow: "hidden",
      }}
    >
      {/* 미세 그레인 — 인화지 표면의 디지털 노이즈 */}
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
      {/* 거친 종이 섬유질 — 저주파 노이즈로 종이 느낌 강화 */}
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
      {/* 프레임 가장자리 어두움 — 종이 두께에 의한 자연 그림자 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: FRAME_EDGE_SHADOW }}
      />
      {/* 하단 엠보스 패턴 — 폴라로이드 특유의 다이아몬드 크로스해치 */}
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
      {/* 사진 영역 — 검은 배경 + 이미지 + 필터 레이어 */}
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
        {/* 사진 리세스 — 에뮬전이 프레임에 눌린 날카로운 경계 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: PHOTO_RECESS_SHADOW }}
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

    </div>
  );
}
