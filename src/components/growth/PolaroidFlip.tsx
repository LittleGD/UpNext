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
    // 자식 인터랙티브 (textarea, button 등) 위에서는 드래그 시작 안 함
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, button, [data-no-flip]")) return;
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
      const flickThreshold = 1.5; // px/ms
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
        {/* Front face */}
        <div style={{ backfaceVisibility: "hidden" }}>{front}</div>
        {/* Back face — 동일 사이즈로 같은 축 회전 */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            transformOrigin: "center center",
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
