"use client";

import { forwardRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  PAPER_FIBER_URL,
  FRAME_DROP_SHADOW,
  FRAME_EDGE_SHADOW,
} from "@/lib/photoFilter";

interface Props {
  value: string;
  onChange?: (v: string) => void;
  /** 읽기 전용 — 디테일 뷰에서 사용. textarea 대신 p 로 렌더 */
  readOnly?: boolean;
  /** textarea focus 진입 — 부모가 자이로 off / accessory bar 표시용으로 사용. */
  onFocus?: () => void;
  /** textarea blur — 부모가 자이로 복구 / accessory bar 감추기용. */
  onBlur?: () => void;
}

const MAX_CHARS = 200;

/**
 * MemoEditor — 폴라로이드 뒷면 메모 작성 영역.
 *
 * ⚠ 폴라로이드 프레임과 동일한 사이즈 (max-w-300px + aspectRatio 184/223) →
 *   "사진 뒷면에 메모를 남긴다" 는 물리적 일관성. 플립해도 카드가 같은 크기로 회전.
 *
 * 디자인:
 *  - 베이지 종이 배경 (#f9f8f5) — 폴라로이드 Frame5 와 동일 톤
 *  - 종이 섬유질 텍스처 — 실물 종이 뒷면 느낌
 *  - 라인 노트 패턴 — 손글씨 가이드
 *  - 드롭/엣지 섀도우 — 프레임과 동일한 두께감
 */
const MemoEditor = forwardRef<HTMLTextAreaElement, Props>(function MemoEditor(
  { value, onChange, readOnly = false, onFocus, onBlur },
  ref,
) {
  const { t } = useTranslation();

  return (
    <div
      className="mx-auto max-w-[300px] w-full relative overflow-hidden flex flex-col"
      style={{
        aspectRatio: "184 / 223",
        backgroundColor: "#f9f8f5",
        borderRadius: 2,
        boxShadow: FRAME_DROP_SHADOW,
      }}
    >
      {/* 종이 섬유질 — 실물 뒷면 텍스처 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: PAPER_FIBER_URL,
          backgroundSize: "200px 200px",
          opacity: 0.10,
          mixBlendMode: "multiply",
        }}
      />
      {/* 가장자리 어두움 — 프레임과 동일 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: FRAME_EDGE_SHADOW }}
      />

      {/* 라인 노트 영역 — 마진 살짝 늘려서 사진 둘러보다 사이드 잡고 tilt/flip 가능. */}
      <div
        className="relative flex-1 mx-6 mt-6 mb-2"
        style={{
          backgroundImage:
            "repeating-linear-gradient(transparent, transparent 23px, #d4c9b8 23px, #d4c9b8 24px)",
          backgroundPosition: "0 8px",
        }}
      >
        {readOnly ? (
          <p
            className="w-full h-full text-[#2a2a2a] leading-[24px] pt-[9px] typo-body whitespace-pre-wrap overflow-auto"
            style={{ fontFamily: "'April16', sans-serif" }}
          >
            {value || <span className="text-[#a09080]">{t("playground.capture.memo")}</span>}
          </p>
        ) : (
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange?.(e.target.value.slice(0, MAX_CHARS))}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={t("playground.capture.memo")}
            className="w-full h-full bg-transparent resize-none outline-none text-[#2a2a2a] leading-[24px] pt-[9px] typo-body placeholder:text-[#a09080]"
            style={{
              fontFamily: "'April16', sans-serif",
              caretColor: "#2a2a2a",
            }}
          />
        )}
      </div>

      {/* 글자 수 카운터 — 프레임 하단 우측 (날짜 스탬프 위치 일관) */}
      <div className="relative px-4 pb-3 text-right">
        <span
          className="font-mono tabular-nums"
          style={{
            fontSize: 10,
            color: value.length > MAX_CHARS * 0.9 ? "#c44" : "#a09080",
            letterSpacing: "0.02em",
          }}
        >
          {value.length}/{MAX_CHARS}
        </span>
      </div>
    </div>
  );
});

export default MemoEditor;
