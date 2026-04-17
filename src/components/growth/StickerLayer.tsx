"use client";

import { useRef, useState, useCallback } from "react";
import type { Sticker } from "@/types/growth";

interface Props {
  stickers: Sticker[];
  /** 인터랙션 모드 — true 면 드래그/제거 가능, false 면 단순 표시만 */
  editable?: boolean;
  onChange?: (stickers: Sticker[]) => void;
  /** 컨테이너 크기 — 픽셀 → 퍼센트 변환에 사용. 부모에서 ref 로 측정. */
  className?: string;
}

/**
 * StickerLayer — 폴라로이드 위 스티커 자유 배치 레이어.
 *
 * 좌표 시스템:
 *  - sticker.x/y 는 0-100 % (부모 컨테이너 기준)
 *  - 어떤 사이즈에서도 일관된 위치 유지 (썸네일 ↔ 디테일 뷰 동기화)
 *
 * 인터랙션:
 *  - editable=true: 스티커 long-press 또는 drag 로 이동, 더블탭으로 제거
 *  - editable=false: pointer-events-none, 시각만 (썸네일/공유 이미지에서)
 *
 * 향후: 핀치 줌, 회전, z-index 변경, 텍스트 스티커
 */

export default function StickerLayer({ stickers, editable = false, onChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ id: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, sticker: Sticker) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // 현재 스티커 픽셀 위치 = 컨테이너 left + (x% * width)
      const stickerPxX = rect.width * (sticker.x / 100);
      const stickerPxY = rect.height * (sticker.y / 100);
      dragStateRef.current = {
        id: sticker.id,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: stickerPxX,
        offsetY: stickerPxY,
      };
    },
    [editable],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editable || !dragStateRef.current || !onChange) return;
      e.stopPropagation();
      const drag = dragStateRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newPxX = drag.offsetX + (e.clientX - drag.startX);
      const newPxY = drag.offsetY + (e.clientY - drag.startY);
      // 클램프: 컨테이너 안에 머무름 (0-100%)
      const newX = Math.max(0, Math.min(100, (newPxX / rect.width) * 100));
      const newY = Math.max(0, Math.min(100, (newPxY / rect.height) * 100));
      onChange(
        stickers.map((s) => (s.id === drag.id ? { ...s, x: newX, y: newY } : s)),
      );
    },
    [editable, onChange, stickers],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
  }, [editable]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (!editable || !onChange) return;
      e.stopPropagation();
      onChange(stickers.filter((s) => s.id !== id));
    },
    [editable, onChange, stickers],
  );

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${editable ? "" : "pointer-events-none"} ${className || ""}`}
    >
      {stickers.map((s) => (
        <StickerView
          key={s.id}
          sticker={s}
          editable={editable}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
      ))}
    </div>
  );
}

interface StickerViewProps {
  sticker: Sticker;
  editable: boolean;
  onPointerDown: (e: React.PointerEvent, sticker: Sticker) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
}

function StickerView({ sticker, editable, onPointerDown, onPointerMove, onPointerUp, onDoubleClick }: StickerViewProps) {
  // 사이즈는 부모 컨테이너 기준 % — 텍스트는 base 28px, scale 적용
  const baseSize = sticker.type === "image" ? 36 : 28;
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, sticker)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => onDoubleClick(e, sticker.id)}
      className={`absolute select-none ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})`,
        zIndex: sticker.zIndex ?? 1,
        // dragger 영역 — 텍스트면 약간의 padding 으로 탭 타겟 확보
        fontSize: sticker.type === "emoji" ? baseSize : undefined,
        lineHeight: 1,
        touchAction: "none",
        userSelect: "none",
        // 약한 그림자로 폴라로이드 위에 떠있는 느낌
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
      }}
    >
      {sticker.type === "emoji" ? (
        sticker.content
      ) : (
        <UpNextStickerMark size={baseSize} />
      )}
    </div>
  );
}

function UpNextStickerMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="0" y="0" width="32" height="32" rx="6" fill="#cdf564" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontWeight="700"
        fontSize="18"
        fill="#212727"
      >
        N
      </text>
    </svg>
  );
}
