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

// 유저 피드백 #3 — sticker 삭제/편집 인디케이터.
//   long-press 500ms 중에 어떤 sticker 가 눌리고 있는지, 남은 시간이 얼마나
//   되는지 시각화. 이 state 는 rendering 의존이므로 React state 로 유지.
const LONG_PRESS_MS = 500;

function StickerLayerImpl({ stickers, editable = false, onChange, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // 길게 눌러서 삭제 진행 중인 sticker id — 눌린 순간 set, 취소/완료 시 null.
  //   해당 sticker 에 selection ring + progress stroke 이 나타나 유저에게
  //   "지금 이 스티커를 지우는 중" 신호를 줌.
  const [pressingId, setPressingId] = useState<string | null>(null);

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

  // localStickers 를 ref 로도 유지 — document-level 리스너 closure 에서 최신 값
  // 참조용 (stale state 방지).
  const localStickersRef = useRef(localStickers);
  useEffect(() => { localStickersRef.current = localStickers; }, [localStickers]);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // 유저 피드백 #2 — 스티커 pinch/rotate 가 동작하지 않던 근본 원인:
  //   React 개별 element 의 onPointerDown 에만 의존 → 두 번째 손가락은 스티커
  //   밖 (SignatureCanvas 위 등) 에 떨어지므로 sticker element 에 pointerdown
  //   이 오지 않음.
  //
  //   해결: 첫 포인터가 sticker 에 내려오면 document-level 리스너를 attach →
  //   이후 모든 pointerdown/move/up 을 document 에서 받아 dragRef 에 합류. 2+
  //   포인터가 어디에 있든 확실히 포착됨. Map 기반 pointer lookup 이므로 단일/
  //   멀티 모드 전환이 동일 로직.
  const docListenersRef = useRef<{
    down: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

  const detachDocListeners = useCallback(() => {
    const l = docListenersRef.current;
    if (!l) return;
    document.removeEventListener("pointerdown", l.down, true);
    document.removeEventListener("pointermove", l.move, true);
    document.removeEventListener("pointerup", l.up, true);
    document.removeEventListener("pointercancel", l.up, true);
    docListenersRef.current = null;
  }, []);

  const applyDragLogic = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
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

  // 2 번째 포인터가 down 할 때 pinch 기준 (initialPinch) 을 세팅.
  const enterPinchMode = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || drag.pointers.size < 2) return;
    const rect = getContainerRect();
    if (!rect) return;
    const sticker = localStickersRef.current.find((s) => s.id === drag.stickerId);
    if (!sticker) return;
    const stickerPxX = rect.width * (sticker.x / 100);
    const stickerPxY = rect.height * (sticker.y / 100);
    const [p1, p2] = Array.from(drag.pointers.values());
    drag.initialPinch = {
      dist: dist(p1, p2),
      angle: ang(p1, p2),
      scale: sticker.scale,
      rotation: sticker.rotation,
      centerOffset: {
        x: (p1.x + p2.x) / 2 - (rect.left + stickerPxX),
        y: (p1.y + p2.y) / 2 - (rect.top + stickerPxY),
      },
    };
    // long-press 취소 (pinch 제스처 우선)
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      setPressingId(null);
    }
  }, []);

  const attachDocListeners = useCallback(() => {
    if (docListenersRef.current) return;
    const down = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // 같은 sticker 의 2+번째 포인터만 합류 (다른 곳 탭은 무시).
      //   폴라로이드 컨테이너 내부 pointerdown 이면 해당 sticker 의 pinch/rotate
      //   를 위한 포인터로 간주.
      const rect = getContainerRect();
      if (!rect) return;
      const x = e.clientX;
      const y = e.clientY;
      // 컨테이너 안에 떨어진 경우만 합류 (폴라로이드 밖 탭은 무시)
      if (
        x < rect.left || x > rect.right ||
        y < rect.top || y > rect.bottom
      ) {
        return;
      }
      // 이미 추적 중인 포인터면 skip.
      if (drag.pointers.has(e.pointerId)) return;
      drag.pointers.set(e.pointerId, { x, y });
      if (drag.pointers.size === 2) {
        enterPinchMode();
      }
    };
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const ptr = drag.pointers.get(e.pointerId);
      if (!ptr) return;
      // long-press 취소 threshold
      if (longPressTimerRef.current) {
        const dx = Math.abs(e.clientX - ptr.x);
        const dy = Math.abs(e.clientY - ptr.y);
        if (dx > 4 || dy > 4) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
          setPressingId(null);
        }
      }
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      applyDragLogic();
    };
    const up = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.pointers.delete(e.pointerId);
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        setPressingId(null);
      }
      if (drag.pointers.size === 0) {
        dragRef.current = null;
        detachDocListeners();
        onChangeRef.current?.(localStickersRef.current);
      } else if (drag.pointers.size === 1) {
        // 한 손가락만 남음 → pinch 상태 해제, 단일 drag 재개.
        drag.initialPinch = undefined;
        const rect = getContainerRect();
        if (rect) {
          const only = Array.from(drag.pointers.values())[0];
          drag.initialPos = { px: only.x - rect.left, py: only.y - rect.top };
        }
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    docListenersRef.current = { down, move, up };
  }, [applyDragLogic, detachDocListeners, enterPinchMode]);

  // Unmount cleanup — attach 되어있던 document 리스너 leak 방지.
  useEffect(() => detachDocListeners, [detachDocListeners]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, sticker: Sticker) => {
      if (!editable) return;
      e.stopPropagation();
      e.preventDefault();

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
        // document-level 리스너 attach → 이후 pointer 이벤트는 document 경로로.
        attachDocListeners();
        // 유저 피드백 #4 — long-press 500ms 후 삭제.
        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
        }
        setPressingId(sticker.id);
        longPressTimerRef.current = window.setTimeout(() => {
          if (!onChangeRef.current) return;
          const next = localStickersRef.current.filter((s) => s.id !== sticker.id);
          setLocalStickers(next);
          onChangeRef.current(next);
          dragRef.current = null;
          longPressTimerRef.current = null;
          setPressingId(null);
          detachDocListeners();
        }, LONG_PRESS_MS);
      }

      dragRef.current!.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dragRef.current!.pointers.size === 2) {
        enterPinchMode();
      }
    },
    [editable, attachDocListeners, detachDocListeners, enterPinchMode],
  );

  // React 엘리먼트-레벨 move/up 은 document 리스너 이전에 첫 pointerdown 을 받을
  // 때만 의미가 있음. document 리스너가 붙으면 동일 포인터의 move/up 을 document
  // 가 받으므로 여기선 no-op 처리하고 noop 시그니처만 유지.
  const handlePointerMove = useCallback((_e: React.PointerEvent) => {}, []);
  const handlePointerUp = useCallback((_e: React.PointerEvent) => {}, []);

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
          isPressing={pressingId === s.id}
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
  /** 유저 피드백 #3 — 길게 누르는 중. progress ring + selection outline. */
  isPressing?: boolean;
  onPointerDown: (e: React.PointerEvent, sticker: Sticker) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent, id: string) => void;
}

const StickerView = memo(function StickerView({ sticker, editable, isPressing = false, onPointerDown, onPointerMove, onPointerUp, onDoubleClick }: StickerViewProps) {
  // 사이즈는 부모 컨테이너 기준 % — 텍스트는 base 36px, image 는 60px
  const isImage = sticker.type === "image";
  const baseSize = isImage ? 60 : 36;
  // 유저 피드백 #3 — ring radius. image 스티커는 로고가 더 크므로 더 여유.
  const ringSize = isImage ? baseSize * 1.5 : baseSize + 12;

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
      {/* 유저 피드백 #3 — long-press 진행 링. 회전 역보정 (스티커 rotation 을
           상쇄) 으로 링은 항상 수직 상태. conic-gradient 로 500ms 동안 0→360°
           채워짐. pointer-events-none 으로 실제 히트 영역에는 영향 없음. */}
      {isPressing && editable && (
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{
            width: ringSize,
            height: ringSize,
            marginLeft: -ringSize / 2,
            marginTop: -ringSize / 2,
            // 스티커의 rotation / scale 을 상쇄 → 링 자체는 수직 1x.
            transform: `rotate(${-sticker.rotation}deg) scale(${1 / sticker.scale})`,
            transformOrigin: "center center",
          }}
        >
          {/* 배경 트랙 (옅음) */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: "0 0 0 2px rgba(255,255,255,0.35)",
            }}
          />
          {/* 진행 링 — conic-gradient 를 mask 로 사용해 2px stroke 만 칠함.
               @keyframes 로 0→100% 를 500ms 동안 채움. */}
          <div
            className="absolute inset-0 rounded-full stickerlayer-longpress-ring"
            style={{
              background: "conic-gradient(var(--accent-primary, #ff5a5f) var(--p, 0%), transparent 0)",
              WebkitMask: "radial-gradient(circle, transparent calc(50% - 2.5px), #000 calc(50% - 2.5px))",
              mask: "radial-gradient(circle, transparent calc(50% - 2.5px), #000 calc(50% - 2.5px))",
            }}
          />
          {/* 힌트 라벨 "계속 누르면 삭제" — ring 아래 작게 */}
          <div
            className="absolute left-1/2 -translate-x-1/2 typo-micro whitespace-nowrap px-1.5 py-0.5 rounded"
            style={{
              top: ringSize + 4,
              background: "rgba(0,0,0,0.75)",
              color: "white",
              fontSize: 10,
            }}
          >
            ✕
          </div>
        </div>
      )}
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
