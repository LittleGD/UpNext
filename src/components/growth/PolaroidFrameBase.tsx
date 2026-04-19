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

/**
 * Phase 14 code-review High #5 — PolaroidFrame1~5 가 공통 렌더링 로직을 각자
 *   ~170 라인씩 중복하고 있어 (총 ~1,042 라인) 유지보수 위험. 장식 위치·크기·선택
 *   유무만 variant 별로 달라서, shared base + decoration config 로 통합.
 *
 * 기존 5 파일은 본 컴포넌트를 decorations 배열과 함께 호출하는 얇은 래퍼가 됨.
 */

export type FoldPosition = "tl" | "tr" | "bl" | "br";

/**
 * Decoration 구성 — base 컴포넌트가 절대 위치 레이어로 렌더.
 *   fold: 프레임 모서리 밀착 스티커 (PNG 원본 픽셀 크기 유지)
 *   crack: 균열 오버레이 (프레임 밖까지 뻗을 수 있어 별도 left 값 + topPct)
 */
export type FrameDecoration =
  | {
      kind: "fold";
      src: string;
      width: number;
      height: number;
      position: FoldPosition;
    }
  | {
      kind: "crack";
      src: string;
      width: number;
      height: number;
      /** 프레임 좌상단 기준 px offset (좌측 밖까지 밀어내기 위해 음수 가능) */
      left: number;
      /** 프레임 높이에 대한 백분율 (반응형 스케일) */
      topPct: number;
      opacity: number;
    };

interface Props {
  imageSrc: string;
  timestamp: number;
  children?: React.ReactNode;
  /** Figma 원본 aspect ratio (대부분 "184 / 223", Frame4 만 "184 / 224") */
  aspectRatio?: string;
  /** 베이지 톤 기본 #f2f1ee, Frame5 의 밝은 아이보리는 #f9f8f5 */
  backgroundColor?: string;
  decorations?: FrameDecoration[];
  /** 디버깅용 Figma 노드 id — optional */
  dataNodeId?: string;
  dataName?: string;
}

// 사진 영역은 모든 variant 에서 동일: 154×157 @ (15, 14) on 184×N frame.
// N=223 / 224 차이는 무시 가능한 세로 ~0.3% 라서 고정 계산으로 통합.
const photoLeftPct = (15 / 184) * 100; // 8.152%
const photoWidthPct = (154 / 184) * 100; // 83.696%

function foldPositionStyle(position: FoldPosition): React.CSSProperties {
  switch (position) {
    case "tl":
      return { left: 0, top: 0 };
    case "tr":
      return { right: 0, top: 0 };
    case "bl":
      return { left: 0, bottom: 0 };
    case "br":
      return { right: 0, bottom: 0 };
  }
}

export default function PolaroidFrameBase({
  imageSrc,
  timestamp,
  children,
  aspectRatio = "184 / 223",
  backgroundColor = "#f2f1ee",
  decorations = [],
  dataNodeId,
  dataName,
}: Props) {
  // SSR 에서는 timestamp 로 즉시 계산 불가 (hydration 불일치) → 초기 0 → mount 후 반영.
  const [vintageOpacity, setVintageOpacity] = useState(0);
  useEffect(() => {
    setVintageOpacity(computeVintageOpacity(timestamp));
  }, [timestamp]);

  // aspect ratio 의 분모 파싱 — caption 영역 높이 계산 시 사용.
  // 형식이 "W / H" 가 아니면 기본값 223 사용.
  const denom = (() => {
    const m = aspectRatio.match(/\/\s*(\d+)/);
    return m ? Number(m[1]) : 223;
  })();
  const photoTopPct = (14 / denom) * 100;
  const photoHeightPct = (157 / denom) * 100;
  const captionTopPct = ((14 + 157) / denom) * 100;
  const captionHeightPct = ((denom - 171) / denom) * 100;

  const d = new Date(timestamp);
  const dateStr = `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="mx-auto max-w-[300px] w-full relative overflow-hidden"
      style={{
        aspectRatio,
        backgroundColor,
        borderRadius: 2,
        boxShadow: FRAME_DROP_SHADOW,
      }}
      data-node-id={dataNodeId}
      data-name={dataName}
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

      {/* 캡션/서명 영역 — 이미지 하단 여백 */}
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

      {/* Decoration 레이어 — fold/crack 을 variant 별 config 로 렌더 */}
      {decorations.map((dec, i) => {
        if (dec.kind === "fold") {
          return (
            <img
              key={i}
              src={dec.src}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute pointer-events-none block"
              style={{
                ...foldPositionStyle(dec.position),
                width: dec.width,
                height: dec.height,
                mixBlendMode: "multiply",
              }}
            />
          );
        }
        return (
          <img
            key={i}
            src={dec.src}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute pointer-events-none block"
            style={{
              left: dec.left,
              top: `${dec.topPct}%`,
              width: dec.width,
              height: dec.height,
              mixBlendMode: "multiply",
              opacity: dec.opacity,
            }}
          />
        );
      })}

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
