"use client";

import { useRef, useCallback, useState, useEffect } from "react";
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
 *  - 길게 누르기 (500ms) → 제거
 *  - editable=false → pointer-events-none, 표시만 (썸네일/공유)
 *
 * 디자인 (Fix 3):
 *  - emoji: 흰 멀티 text-shadow 외곽선 + 입체 drop shadow
 *  - image (UpNext 로고): 흰 카드 배경 + 풀 로고 + drop shadow → "die-cut 스티커" 느낌
 *
 * 유저 피드백 Round 2 — 핀치 미작동 근본 원인.
 *   기존 설계: StickerLayer 컨테이너 = pointer-events: none, 개별 sticker 만 auto.
 *   1st finger 가 sticker 에 닿으면 setPointerCapture → drag 시작.
 *   2nd finger 가 sticker 범위 밖 (잉크 캔버스 위) 에 닿으면 → 해당 pointerdown
 *   이 SignatureCanvas 로 hit-tested → 잉크 그려짐. Sticker 의 2nd-pointer
 *   핸들러는 "2nd finger 도 sticker 위에 떨어져야" 호출되는데 현실 핀치 제스처는
 *   거의 대부분 sticker 범위 밖에서 시작.
 *
 *   수정: 1st pointer down → `activeDragId` state set → re-render 시 window-level
 *   pointer 리스너 capture 모드로 등록 → SignatureCanvas 도달 전에 가로채서
 *   sticker pinch 핸들러로 라우팅. 모든 포인터 release 시 리스너 제거.
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

export default function StickerLayer({ stickers, editable = false, onChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // window 리스너 트리거용 state — 첫 포인터 down 시 activeDragId 세팅 →
  // useEffect 가 window pointerdown/move/up capture-phase 리스너 등록.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

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

  // localStickers / onChange 최신 값을 ref 로 — window 리스너 내부에서 stale closure 회피.
  const localStickersRef = useRef(localStickers);
  const onChangeRef = useRef(onChange);
  useEffect(() => { localStickersRef.current = localStickers; }, [localStickers]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

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

  // === 공용 변형 로직 ===
  // 1st pointer 드래그 / 2nd+ pointer pinch 모두 이 함수로 처리.
  // 기존 onPointerDown 내부에 있던 로직을 꺼내서 window 리스너 에서도 재사용.
  const applyPointerUpdate = useCallback(() => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    const rect = getContainerRect();
    if (!rect) return;
    const sticker = localStickersRef.current.find((s) => s.id === drag.stickerId);
    if (!sticker) return;

    if (drag.pointers.size === 1 && drag.initialPos) {
      const onlyPtr = Array.from(drag.pointers.values())[0];
      const newPxX = onlyPtr.x - rect.left;
      const newPxY = onlyPtr.y - rect.top;
      const newX = Math.max(0, Math.min(100, (newPxX / rect.width) * 100));
      const newY = Math.max(0, Math.min(100, (newPxY / rect.height) * 100));
      updateSticker(sticker.id, { x: newX, y: newY });
      drag.initialPos = { px: newPxX, py: newPxY };
    } else if (drag.pointers.size >= 2 && drag.initialPinch) {
      const [p1, p2] = Array.from(drag.pointers.values());
      const currentDist = dist(p1, p2);
      const currentAngle = ang(p1, p2);
      const ip = drag.initialPinch;
      const newScale = Math.max(0.4, Math.min(3.0, ip.scale * (currentDist / ip.dist)));
      const newRotation = ip.rotation + (currentAngle - ip.angle);
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
  }, [updateSticker]);

  // 2nd pointer pinch 초기화 — 두 포인터 간 거리/각도/중심 offset 계산.
  const setupPinchState = useCallback(() => {
    if (!dragRef.current || dragRef.current.pointers.size < 2) return;
    const rect = getContainerRect();
    if (!rect) return;
    const sticker = localStickersRef.current.find((s) => s.id === dragRef.current!.stickerId);
    if (!sticker) return;
    const [p1, p2] = Array.from(dragRef.current.pointers.values());
    const stickerPxX = rect.width * (sticker.x / 100);
    const stickerPxY = rect.height * (sticker.y / 100);
    dragRef.current.initialPinch = {
      dist: dist(p1, p2),
      angle: ang(p1, p2),
      scale: sticker.scale,
      rotation: sticker.rotation,
      centerOffset: {
        x: (p1.x + p2.x) / 2 - (rect.left + stickerPxX),
        y: (p1.y + p2.y) / 2 - (rect.top + stickerPxY),
      },
    };
  }, []);

  // drag 종료 — 모든 포인터 release 시 onChange flush + state reset.
  const finalizeDrag = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (dragRef.current && onChangeRef.current) {
      onChangeRef.current(localStickersRef.current);
    }
    dragRef.current = null;
    setActiveDragId(null);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, sticker: Sticker) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;

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
        // 1st pointer 만 capture — sticker 밖 drag 유지. 이후 activeDragId 로
        //   window 리스너가 2nd+ pointer 처리 (SignatureCanvas 가로채기).
        try {
          target.setPointerCapture(e.pointerId);
        } catch {}
        // long-press 500ms 시 삭제
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = window.setTimeout(() => {
          if (!onChangeRef.current) return;
          const next = localStickersRef.current.filter((s) => s.id !== sticker.id);
          setLocalStickers(next);
          onChangeRef.current(next);
          dragRef.current = null;
          setActiveDragId(null);
          longPressTimerRef.current = null;
        }, 500);
        // state set → window capture-phase 리스너 등록 (useEffect)
        setActiveDragId(sticker.id);
      }

      dragRef.current!.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (dragRef.current!.pointers.size === 2) {
        // multi-touch 진입 → long-press 취소
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        // 1st pointer 의 capture 해제 — 혹시 이 시점에 sticker 위에서 2nd finger
        //   이 내려오면 (rare case), 기존 capture 가 interference.
        for (const pointerId of dragRef.current!.pointers.keys()) {
          try {
            target.releasePointerCapture(pointerId);
          } catch {}
        }
        setupPinchState();
      }
    },
    [editable, setupPinchState],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editable || !dragRef.current) return;
      e.stopPropagation();
      const drag = dragRef.current;
      const ptr = drag.pointers.get(e.pointerId);
      if (!ptr) return;

      // 포인터가 살짝이라도 움직이면 long-press 취소 (임계값 4px).
      if (longPressTimerRef.current) {
        const dx = Math.abs(e.clientX - ptr.x);
        const dy = Math.abs(e.clientY - ptr.y);
        if (dx > 4 || dy > 4) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      ptr.x = e.clientX;
      ptr.y = e.clientY;
      applyPointerUpdate();
    },
    [editable, applyPointerUpdate],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!editable || !dragRef.current) return;
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
      dragRef.current.pointers.delete(e.pointerId);
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (dragRef.current.pointers.size === 0) {
        finalizeDrag();
      } else {
        // 일부만 떨어지면 pinch 상태 reset — 남은 포인터로 1-finger drag 재개
        dragRef.current.initialPinch = undefined;
      }
    },
    [editable, finalizeDrag],
  );

  // ===== 유저 피드백 Round 2: window-level pointer 캡쳐 =====
  //
  // 1st pointer down on sticker → activeDragId set → 이 useEffect 가 발동 →
  //   window `pointerdown` / `pointermove` / `pointerup` 를 capture-phase
  //   (useCapture=true) 로 등록.
  // Capture phase = DOM tree 내려가는 방향에서 가장 먼저 실행 → SignatureCanvas
  //   의 pointerdown 핸들러 (bubble phase) 보다 먼저 → e.stopPropagation() 으로
  //   잉크 그리기 방지.
  // 2nd+ pointer 가 폴라로이드 container 내부에 떨어지면 sticker pinch 로 라우팅.
  // activeDragId null 되면 리스너 제거 → 정상 잉크 그리기 복원.
  useEffect(() => {
    if (!activeDragId || !editable) return;

    const isInsideContainer = (e: PointerEvent): boolean => {
      if (!containerRef.current) return false;
      const rect = containerRef.current.getBoundingClientRect();
      return (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
    };

    const handleWinPointerDown = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // 이미 추적 중인 포인터는 skip (sticker element onPointerDown 이 먼저 처리)
      if (drag.pointers.has(e.pointerId)) return;
      // 폴라로이드 container 밖은 무시 (모달 닫기 버튼 등 정상 동작 필요)
      if (!isInsideContainer(e)) return;

      // 2nd+ pointer → sticker pinch 로 라우팅. SignatureCanvas 에 가지 않게 차단.
      e.preventDefault();
      e.stopPropagation();

      drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (drag.pointers.size === 2) {
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setupPinchState();
      } else if (drag.pointers.size > 2) {
        // 3+ finger 는 무시 (기존 2-finger pinch 유지)
      }
    };

    const handleWinPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const ptr = drag.pointers.get(e.pointerId);
      if (!ptr) return;
      // 추적 중인 포인터의 move → SignatureCanvas 가 같은 pointerId 로
      //   onPointerMove 받으면 draw 시도. stopPropagation 으로 차단.
      e.stopPropagation();
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      applyPointerUpdate();
    };

    const handleWinPointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.pointers.has(e.pointerId)) return;
      e.stopPropagation();
      drag.pointers.delete(e.pointerId);
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (drag.pointers.size === 0) {
        finalizeDrag();
      } else {
        drag.initialPinch = undefined;
      }
    };

    window.addEventListener("pointerdown", handleWinPointerDown, { capture: true });
    window.addEventListener("pointermove", handleWinPointerMove, { capture: true });
    window.addEventListener("pointerup", handleWinPointerUp, { capture: true });
    window.addEventListener("pointercancel", handleWinPointerUp, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", handleWinPointerDown, { capture: true });
      window.removeEventListener("pointermove", handleWinPointerMove, { capture: true });
      window.removeEventListener("pointerup", handleWinPointerUp, { capture: true });
      window.removeEventListener("pointercancel", handleWinPointerUp, { capture: true });
    };
  }, [activeDragId, editable, setupPinchState, applyPointerUpdate, finalizeDrag]);

  // 데스크톱 더블클릭 fallback — 마우스 유저는 long-press 가 어색할 수 있음.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (!editable || !onChange) return;
      e.stopPropagation();
      const next = localStickersRef.current.filter((s) => s.id !== id);
      setLocalStickers(next);
      onChange(next);
    },
    [editable, onChange],
  );

  // ⚠ 컨테이너는 항상 pointer-events: none — 빈 공간은 아래 레이어 (SignatureCanvas)
  // 가 받게 함. 개별 sticker 만 editable 시 pointer-events: auto.
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

interface StickerViewProps {
  sticker: Sticker;
  editable: boolean;
  onPointerDown: (e: React.PointerEvent, sticker: Sticker) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
}

function StickerView({ sticker, editable, onPointerDown, onPointerMove, onPointerUp, onDoubleClick }: StickerViewProps) {
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
}
