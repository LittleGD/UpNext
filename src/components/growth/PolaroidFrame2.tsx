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

/**
 * PolaroidFrame2 — Figma `p-frame2` 기반, 장식은 역할 기반 자산으로 교체.
 *
 * 원본 프레임: 184×223 — max-width 300px 기준으로 ~1.63배 업스케일.
 * 구성:
 *  - 베이지 카드(#e8e7e3, rounded 4px, overflow-hidden)
 *  - 검은 사진 영역: 원본 좌표 x=15/y=14/154×157 (퍼센트 기반)
 *  - 우상단 모서리 fold (`frame-right-top-fold.png`, 19×7 원본 크기 그대로)
 *    mix-blend-multiply 로 베이지 톤과 섞음
 *  - 사진 영역 내부: Kodak 필터 + 필름 그레인 + 비네트 + 인셋 섀도우 + 오렌지 날짜 스탬프
 */
export default function PolaroidFrame2({ imageSrc, timestamp, children }: Props) {
  // 경과 일수 기반 빈티지 에이징 — 3일 간격 step, 21일에서 최대.
  // Date.now() 를 mount 후 한 번 계산해 SSR/hydration 불일치 회피 (초기 SSR 은 opacity 0).
  const [vintageOpacity, setVintageOpacity] = useState(0);
  useEffect(() => {
    setVintageOpacity(computeVintageOpacity(timestamp));
  }, [timestamp]);
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

  // 장식은 전부 PNG 원본 픽셀 크기로 배치 — 업스케일 해상도 손실 방지
  // (프레임만 반응형 스케일, 장식은 고정 크기)
  const FOLD_W = 19;
  const FOLD_H = 7;

  return (
    <div
      className="mx-auto max-w-[300px] w-full relative overflow-hidden"
      style={{
        aspectRatio: "184 / 223",
        backgroundColor: "#f2f1ee",
        borderRadius: 2,
        boxShadow: FRAME_DROP_SHADOW,
      }}
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
          top: `${((14 + 157) / 223) * 100}%`,
          bottom: 0,
          background: BOTTOM_EMBOSS_PATTERN,
        }}
      />
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
        {/* 사진 리세스 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: PHOTO_RECESS_SHADOW }}
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

      {/* 우상단 모서리 fold — PNG 원본 크기, 방향이 PNG에 포함 */}
      <img
        src="/polaroid/frame-right-top-fold.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute pointer-events-none block"
        style={{
          right: 0,
          top: 0,
          width: FOLD_W,
          height: FOLD_H,
          mixBlendMode: "multiply",
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

      {/* 표면 반사광 — 광택 인화지의 대각선 글로스 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: FRAME_REFLECTION }}
      />
    </div>
  );
}
