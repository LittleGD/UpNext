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
 * PolaroidFrame2 — Figma `p-frame2` 기반, 장식은 역할 기반 자산으로 교체.
 *
 * 원본 프레임: 184×223 — max-width 300px 기준으로 ~1.63배 업스케일.
 * 구성:
 *  - 베이지 카드(#e8e7e3, rounded 4px, overflow-hidden)
 *  - 검은 사진 영역: 원본 좌표 x=15/y=14/154×157 (퍼센트 기반)
 *  - 우상단 모서리 fold (`frame-right-top-fold.png`, 19×7 원본 크기 그대로)
 *    mix-blend-multiply 로 베이지 톤과 섞음
 *  - 하단 엣지 테이프 (`frame-left-edge-tape.png`, 152×44 원본 크기 그대로)
 *    프레임 하단 엣지에 절반쯤 걸쳐 좌측으로 살짝 삐져나간 배치 — 벽에 붙인 느낌
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
  const TAPE_W = 152;
  const TAPE_H = 44;
  // 테이프를 프레임 하단 엣지에 걸침 — 절반쯤 프레임 밖으로 삐져나오게
  const TAPE_LEFT = -16; // 좌측에서 살짝 프레임 밖
  const TAPE_BOTTOM = -TAPE_H / 2; // 하단 엣지에서 절반 밖 (≈ -22)

  return (
    <div
      className="mx-auto max-w-[300px] w-full relative overflow-hidden"
      style={{
        aspectRatio: "184 / 223",
        backgroundColor: "#e8e7e3",
        borderBottom: "1px solid #423F3C",
        borderRadius: 4,
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

      {/* 하단 엣지 테이프 — PNG 원본 크기, 좌하단에 절반쯤 삐져나옴 */}
      <img
        src="/polaroid/frame-left-edge-tape.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute pointer-events-none block"
        style={{
          left: TAPE_LEFT,
          bottom: TAPE_BOTTOM,
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
