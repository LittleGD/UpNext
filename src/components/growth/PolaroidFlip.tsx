"use client";

import { useState, useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimationFrame,
} from "framer-motion";

interface Props {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped?: boolean;
  onFlip?: (isFlipped: boolean) => void;
}

/**
 * PolaroidFlip — 사진 앞면 ↔ 메모 뒷면 플립.
 *
 * ⚠ flip 버튼은 의도적으로 이 컴포넌트 안에 없음.
 *   PolaroidTilt + PolaroidFlip 으로 감쌀 때 버튼이 폴라로이드와 함께 회전/틸트하면
 *   안 되므로 부모 (PhotoDetailModal/PhotoCaptureModal) 에서 별도로 배치.
 *
 * 인터랙션:
 *   - 가로 드래그: 손가락으로 폴라로이드 직접 회전. 실물 카드 같은 느낌.
 *     150px = 90°, release 시 임계값(±90°) 또는 velocity 로 스냅.
 *   - 외부 onFlip prop 으로 버튼 트리거도 가능.
 *
 * 회전 축:
 *   - transform-origin: center center (default) — 폴라로이드 중앙에서 회전
 *   - manual pointer events 사용 (framer-motion drag 의 translation 부작용 회피)
 *     framer-motion drag 는 dragConstraints 와 무관하게 transform 에 translateX 를
 *     적용해 회전 축이 어긋나 보이게 함.
 *
 * back face 는 absolute inset-0 로 front 와 동일 사이즈/위치 — 같은 중심으로 회전.
 */
export default function PolaroidFlip({ front, back, flipped: controlledFlipped, onFlip }: Props) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = controlledFlipped ?? internalFlipped;
  const baseRotation = isFlipped ? 180 : 0;

  // 드래그 누적 회전 (degrees) — 0 = 안 누름. ±값 = 손가락이 끄는 방향
  const dragRotation = useMotionValue(0);
  // 실제 적용 회전 = baseRotation + dragRotation
  const rotateY = useTransform(dragRotation, (d) => baseRotation + d);

  const handleFlip = useCallback(() => {
    const next = !isFlipped;
    if (onFlip) onFlip(next);
    else setInternalFlipped(next);
  }, [isFlipped, onFlip]);

  // 드래그 상태
  const dragState = useRef<{
    active: boolean;
    startX: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
  } | null>(null);

  // 복귀 애니메이션 (drag 가 임계값 미달 시 0 으로 부드럽게 돌아옴)
  const springTarget = useRef<number | null>(null);
  useAnimationFrame(() => {
    if (springTarget.current === null) return;
    const current = dragRotation.get();
    const target = springTarget.current;
    const next = current + (target - current) * 0.18;
    if (Math.abs(next - target) < 0.1) {
      dragRotation.set(target);
      springTarget.current = null;
    } else {
      dragRotation.set(next);
    }
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Phase 15 review U3 — 제스처 passthrough selector 를 단일 규약으로 통합.
    //   PolaroidFlip / PolaroidTilt / StickerLayer 가 전부 `textarea, input,
    //   button, [data-polaroid-passthrough]` 하나만 체크하도록 규격화.
    //   legacy `[data-no-flip]` / `[data-no-tilt]` 도 backward-compat 으로 동작.
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "textarea, input, button, [data-polaroid-passthrough], [data-no-flip]",
      )
    ) {
      return;
    }
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    springTarget.current = null; // 진행 중 복귀 애니 중단
    const now = performance.now();
    dragState.current = {
      active: true,
      startX: e.clientX,
      lastX: e.clientX,
      lastTime: now,
      velocityX: 0,
    };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ds = dragState.current;
      if (!ds?.active) return;
      const now = performance.now();
      const dt = Math.max(1, now - ds.lastTime);
      ds.velocityX = (e.clientX - ds.lastX) / dt;
      ds.lastX = e.clientX;
      ds.lastTime = now;
      const offsetX = e.clientX - ds.startX;
      // 150px = 90° 변환 (선형)
      dragRotation.set((offsetX / 150) * 90);
    },
    [dragRotation],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ds = dragState.current;
      if (!ds?.active) return;
      ds.active = false;
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);

      const dragDeg = dragRotation.get();
      // P4 — 120Hz 디스플레이(iPhone Pro / iPad Pro)에서 dt 가 작아져 velocity 가
      //   과장되며 flick 이 과민 트리거되던 문제. touch 입력만 살짝 올려
      //   의도치 않은 flip 을 줄임. pointerType 은 up 이벤트에서 읽음.
      const isTouch = (e.nativeEvent as PointerEvent).pointerType === "touch";
      const flickThreshold = isTouch ? 1.8 : 1.5; // px/ms
      const angleThreshold = 90; // degrees

      const passedAngle = Math.abs(dragDeg) > angleThreshold;
      // velocityX 부호 = drag 방향. dragDeg 부호도 같은 방향.
      const flickFast = Math.abs(ds.velocityX) > flickThreshold;
      const sameDirection = Math.sign(ds.velocityX) === Math.sign(dragDeg);

      if (passedAngle || (flickFast && sameDirection && Math.abs(dragDeg) > 30)) {
        // 플립 — drag 누적 0 으로 리셋, isFlipped 토글
        dragRotation.set(0);
        handleFlip();
      } else {
        // 원위치 — spring 보간으로 0 으로 복귀
        springTarget.current = 0;
      }
    },
    [dragRotation, handleFlip],
  );

  return (
    <div className="relative" style={{ perspective: 1000 }}>
      <motion.div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          rotateY,
          transformStyle: "preserve-3d",
          transformOrigin: "center center",
          cursor: "grab",
          touchAction: "pan-y", // 세로 스크롤은 허용
        }}
      >
        {/* Front face.
             유저 피드백 #1 / #5 — iOS Safari 의 backface-visibility: hidden 는
             시각적으론 뒤집힌 면을 숨겨도 pointer events / repaint 를 항상
             차단하진 않음 → (1) 뒤집혀 있는데 textarea 탭이 먹통 (2) 앞면
             스티커/사인이 메모 배경에 비침.
             committed flip 상태 (isFlipped) 기준으로 inactive face 를
             pointer-events: none + visibility: hidden 으로 이중 차단.
             drag 중엔 양쪽 다 보이게 해서 3D 회전 중간 프레임 유지. */}
        <div
          style={{
            backfaceVisibility: "hidden",
            pointerEvents: isFlipped ? "none" : "auto",
          }}
        >
          {front}
        </div>
        {/* Back face — 동일 사이즈로 같은 축 회전 */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            transformOrigin: "center center",
            pointerEvents: isFlipped ? "auto" : "none",
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
