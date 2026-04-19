"use client";

import { useRef, useCallback, useState, useEffect, memo } from "react";
import type { Sticker } from "@/types/growth";
import UpNextLogoMark from "./UpNextLogoMark";

interface Props {
  stickers: Sticker[];
  /** 인터랙션 모드 — true 면 드래그/제거/변형 가능, false 면 단순 표시만 */
  editable?: boolean;
  onChange?: (stickers: Sticker[]) => void;
  className?: string;
}

/**
 * StickerLayer — 폴라로이드 위 스티커 자유 배치 + 멀티터치 변형 레이어.
 *
 * 좌표:
 *  - sticker.x/y 는 0-100 % (부모 컨테이너 기준) — 어떤 사이즈에서도 일관 위치
 *  - rotation: degrees, scale: multiplier
 *
 * 인터랙션 (editable=true):
 *  - 1 pointer drag → 이동
 *  - 2 pointer pinch → scale, 2 pointer rotate → rotation (동시 가능)
 *  - 더블탭 → 제거
 *  - editable=false → pointer-events-none, 표시만 (썸네일/공유)
 *
 * 디자인 (Fix 3):
 *  - emoji: 흰 멀티 text-shadow 외곽선 + 입체 drop shadow
 *  - image (UpNext 로고): 흰 카드 배경 + 풀 로고 + drop shadow → "die-cut 스티커" 느낌
 */

// 스티커가 사진 위에 "붙어있는" 느낌 — drop shadow blur 최소화 (떠있는 느낌 방지).
// 흰 외곽선은 die-cut 종이 스티커의 테두리, 그림자는 종이 두께만큼만 살짝.
const TEXT_OUTLINE = [
  "1.5px 0 white", "-1.5px 0 white",
  "0 1.5px white", "0 -1.5px white",
  "1px 1px white", "-1px -1px white", "1px -1px white", "-1px 1px white",
  "0 1px 1.5px rgba(0,0,0,0.40)", // 떠있는 느낌 X — 종이 edge 만 (3px/6px → 1px/1.5px)
].join(", ");

const IMG_FILTER =
  "drop-shadow(0 0 1px white) drop-shadow(0 0 1px white) drop-shadow(0 1px 1.5px rgba(0,0,0,0.40))";

// 멀티터치 변형 상태 — sticker 하나당 활성 pointer 들과 초기 변형 값 추적.
interface DragState {
  stickerId: string;
  pointers: Map<number, { x: number; y: number }>;
  // 1포인터 드래그 시작 시점의 sticker 위치 (px 환산)
  initialPos?: { px: number; py: number };
  // 2포인터 변형 시작 시점의 거리/각도/scale/rotation
  initialPinch?: {
    dist: number;
    angle: number;
    scale: number;
    rotation: number;
    centerOffset: { x: number; y: number };
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function ang(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function StickerLayerImpl({ stickers, editable = false, onChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Phase 13 review Critical — drag 성능 개선. 이전엔 매 pointermove 마다
  //   onChange(stickers.map(...)) 호출로 부모 (PhotoCaptureModal /
  //   PhotoDetailModal) state 업데이트 → 전체 트리 re-render → drag 중 60fps
  //   떨어짐. 이제 drag 중엔 localStickers state 로만 update (StickerLayer 내부
  //   만 re-render), pointerup 에서 onChange flush.
  //
  //   useState(stickers) 초기화 + 외부 prop 변경 시 동기화. drag 중이면 외부
  //   동기화 건너뛰어 덮어쓰기 방지.
  const [localStickers, setLocalStickers] = useState(stickers);
  useEffect(() => {
    if (!dragRef.current) {
      setLocalStickers(stickers);
    }
  }, [stickers]);

  // 컨테이너 좌표계 helpers
  const getContainerRect = () => containerRef.current?.getBoundingClientRect();

  const updateSticker = useCallback((id: string, patch: Partial<Sticker>) => {
    // Drag 중 local update 만 — onChange 는 pointerup 에서 flush.
    setLocalStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  // 유저 피드백 #4 — 스티커 제거 long-press timer (500ms).
  //   기존 더블탭은 모바일에서 zoom 충돌 + 발견 어려움. 길게 누름은 자연스러움.
  const longPressTimerRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, sticker: Sticker) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;

      // 유저 피드백 #3 — 멀티터치 변형 (pinch/rotate) 차단 원인 해결.
      //   기존: setPointerCapture 가 첫 번째 포인터를 sticker 에 lock →
      //   두 번째 포인터 down 이 같은 element 에 안 옴 (모바일 브라우저).
      //   수정: 1 포인터 모드에서만 capture (sticker 밖 drag 허용용).
      //         2 번째 포인터 진입 시점에 capture 해제 → 양 손가락 모두 받음.

      // 다른 sticker 가 활성 중이면 무시 (한 번에 하나만 변형)
      if (dragRef.current && dragRef.current.stickerId !== sticker.id) return;

      const rect = getContainerRect();
      if (!rect) return;

      const stickerPxX = rect.width * (sticker.x / 100);
      const stickerPxY = rect.height * (sticker.y / 100);

      const isFirstPointer = !dragRef.current;
      if (isFirstPointer) {
        dragRef.current = {
          stickerId: sticker.id,
          pointers: new Map(),
          initialPos: { px: stickerPxX, py: stickerPxY },
        };
        // 첫 포인터만 capture — sticker 밖으로 손가락이 나가도 drag 유지.
        try {
          target.setPointerCapture(e.pointerId);
        } catch {}
        // 유저 피드백 #4 — long-press 500ms 시 sticker 삭제.
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = window.setTimeout(() => {
          if (!onChange) return;
          const next = localStickers.filter((s) => s.id !== sticker.id);
          setLocalStickers(next);
          onChange(next);
          dragRef.current = null;
          longPressTimerRef.current = null;
        }, 500);
      }

      dragRef.current!.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 두 번째 포인터 down → pinch/rotate 모드 진입.
      //   이 시점에 모든 포인터 capture 해제 → 두 번째 손가락이 다른 element
      //   위에 있어도 container 가 받을 수 있게.
      if (dragRef.current!.pointers.size === 2) {
        // long-press 취소 (멀티터치 변형 시작)
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        for (const pointerId of dragRef.current!.pointers.keys()) {
          try {
            target.releasePointerCapture(pointerId);
          } catch {}
        }
        const [p1, p2] = Array.from(dragRef.current!.pointers.values());
        dragRef.current!.initialPinch = {
          dist: dist(p1, p2),
          angle: ang(p1, p2),
          scale: sticker.scale,
          rotation: sticker.rotation,
          // 두 포인터의 center 와 sticker 중심의 offset (회전 중심 유지용)
          centerOffset: {
            x: (p1.x + p2.x) / 2 - (rect.left + stickerPxX),
            y: (p1.y + p2.y) / 2 - (rect.top + stickerPxY),
          },
        };
      }
    },
    [editable, localStickers, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editable || !dragRef.current) return;
      e.stopPropagation();
      const drag = dragRef.current;
      const ptr = drag.pointers.get(e.pointerId);
      if (!ptr) return;

      // 유저 피드백 #4 — 포인터가 살짝이라도 움직이면 long-press 취소.
      //   임계값 4px (uncertain tap 허용). 그 이상이면 drag 의도로 판단.
      if (longPressTimerRef.current) {
        const dx = Math.abs(e.clientX - ptr.x);
        const dy = Math.abs(e.clientY - ptr.y);
        if (dx > 4 || dy > 4) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      // 포인터 위치 업데이트
      ptr.x = e.clientX;
      ptr.y = e.clientY;

      const rect = getContainerRect();
      if (!rect) return;

      // Phase 13 review — drag 중엔 localStickers 기준 (최신 drag override 반영).
      const sticker = localStickers.find((s) => s.id === drag.stickerId);
      if (!sticker) return;

      if (drag.pointers.size === 1 && drag.initialPos) {
        // 단일 포인터 드래그 — 이동
        const onlyPtr = Array.from(drag.pointers.values())[0];
        const startPtr = onlyPtr; // 첫 down 시 같은 객체에 set 했으므로 처음과 현재 비교 별도 필요
        // 위치 = 첫 다운 시 initialPos 에서 포인터 이동량만큼 (포인터의 down 시점 좌표는 따로 저장 필요)
        // 단순화: 현재 포인터 위치 기준으로 sticker px 좌표 직접 매핑 (사용자 손가락 위에)
        const newPxX = onlyPtr.x - rect.left;
        const newPxY = onlyPtr.y - rect.top;
        const newX = Math.max(0, Math.min(100, (newPxX / rect.width) * 100));
        const newY = Math.max(0, Math.min(100, (newPxY / rect.height) * 100));
        updateSticker(sticker.id, { x: newX, y: newY });
        // initialPos 갱신해 다음 move 도 일관
        drag.initialPos = { px: newPxX, py: newPxY };
      } else if (drag.pointers.size >= 2 && drag.initialPinch) {
        // 멀티 포인터 — pinch + rotate
        const [p1, p2] = Array.from(drag.pointers.values());
        const currentDist = dist(p1, p2);
        const currentAngle = ang(p1, p2);
        const ip = drag.initialPinch;
        const newScale = Math.max(0.4, Math.min(3.0, ip.scale * (currentDist / ip.dist)));
        const newRotation = ip.rotation + (currentAngle - ip.angle);
        // 중심 위치도 이동 (pan + zoom 동시)
        const newCenterX = (p1.x + p2.x) / 2;
        const newCenterY = (p1.y + p2.y) / 2;
        const newPxX = newCenterX - rect.left - ip.centerOffset.x;
        const newPxY = newCenterY - rect.top - ip.centerOffset.y;
        const newX = Math.max(0, Math.min(100, (newPxX / rect.width) * 100));
        const newY = Math.max(0, Math.min(100, (newPxY / rect.height) * 100));
        updateSticker(sticker.id, {
          scale: newScale,
          rotation: newRotation,
          x: newX,
          y: newY,
        });
      }
    },
    [editable, localStickers, updateSticker],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!editable || !dragRef.current) return;
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
      dragRef.current.pointers.delete(e.pointerId);
      // 유저 피드백 #4 — 포인터 뗌 → long-press 취소.
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      // 모든 포인터 떨어지면 drag 종료 + onChange flush
      if (dragRef.current.pointers.size === 0) {
        dragRef.current = null;
        // Phase 13 review — pointerup 시점에만 부모 onChange 호출 (drag 종료).
        if (onChange) onChange(localStickers);
      } else {
        // 일부만 떨어지면 pinch 상태 reset (남은 포인터로 다시 시작)
        dragRef.current.initialPinch = undefined;
      }
    },
    [editable, localStickers, onChange],
  );

  // 유저 피드백 #4 — 더블클릭은 long-press 로 대체. 데스크톱은 더블클릭 fallback 유지.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (!editable || !onChange) return;
      e.stopPropagation();
      const next = localStickers.filter((s) => s.id !== id);
      setLocalStickers(next);
      onChange(next);
    },
    [editable, onChange, localStickers],
  );

  // ⚠ 컨테이너는 항상 pointer-events: none — 빈 공간은 아래 레이어 (SignatureCanvas)
  // 가 받게 함. 개별 sticker 만 editable 시 pointer-events: auto.
  // 이전 버그: editable=true 시 컨테이너가 absolute inset-0 으로 모든 pointer 흡수
  // → 캔버스에 그릴 수가 없었음 (특히 PhotoDetailModal Edit 모드).
  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none ${className || ""}`}
    >
      {/* Phase 13 review — drag 중엔 localStickers 기준 렌더 (60fps 유지). */}
      {localStickers.map((s) => (
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

// Phase 14 code-review High #11 — StickerLayer + StickerView 둘 다 memo.
//   부모 모달은 toolbar / state 변경으로 자주 re-render 되지만 sticker 배열은
//   drag 종료 시에만 변경됨 → shallow compare 로 무관 render skip.
const StickerLayer = memo(StickerLayerImpl);
export default StickerLayer;

interface StickerViewProps {
  sticker: Sticker;
  editable: boolean;
  onPointerDown: (e: React.PointerEvent, sticker: Sticker) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
}

const StickerView = memo(function StickerView({ sticker, editable, onPointerDown, onPointerMove, onPointerUp, onDoubleClick }: StickerViewProps) {
  // 사이즈는 부모 컨테이너 기준 % — 텍스트는 base 36px, image 는 60px
  const isImage = sticker.type === "image";
  const baseSize = isImage ? 60 : 36;

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, sticker)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => onDoubleClick(e, sticker.id)}
      className={`absolute select-none ${editable ? "cursor-grab active:cursor-grabbing pointer-events-auto" : "pointer-events-none"}`}
      style={{
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})`,
        zIndex: sticker.zIndex ?? 1,
        fontSize: !isImage ? baseSize : undefined,
        lineHeight: 1,
        touchAction: "none",
        userSelect: "none",
        // emoji: 멀티 text-shadow 로 흰 외곽선 + 입체 그림자
        // image: filter 로 처리 (아래)
        textShadow: !isImage ? TEXT_OUTLINE : undefined,
        filter: isImage ? IMG_FILTER : undefined,
      }}
    >
      {sticker.type === "emoji" ? (
        sticker.content
      ) : sticker.content === "upnext-logo" ? (
        // UpNext 로고 — 흰 둥근 카드 위에 풀 로고
        <div
          style={{
            width: baseSize * 1.3,
            height: baseSize * 0.55,
            backgroundColor: "white",
            borderRadius: 8,
            padding: "6px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UpNextLogoMark width={baseSize * 1.05} color="#212727" />
        </div>
      ) : null}
    </div>
  );
});
