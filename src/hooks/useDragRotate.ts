"use client";

import { useRef, useCallback, useState } from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

const SENSITIVITY = 0.15; // deg per pixel
const MAX_ROTATION = 15;  // ±15°
const SPRING_CONFIG = { stiffness: 150, damping: 15 };

export interface DragRotateReturn {
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  isDragging: boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

/**
 * 포인터 드래그로 3D 카드를 rotateX/Y 조작하는 훅.
 * useMotionValue → 리렌더 0회. useSpring → 릴리즈 시 snap-back.
 */
export function useDragRotate(
  onFirstMove?: () => void,
): DragRotateReturn {
  const reducedMotion = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, SPRING_CONFIG);
  const rotateY = useSpring(rawY, SPRING_CONFIG);

  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const hasFiredFirstMove = useRef(false);

  const clamp = (v: number) => Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, v));

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (reducedMotion) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startPos.current = { x: e.clientX, y: e.clientY };
    hasFiredFirstMove.current = false;
    setIsDragging(true);
  }, [reducedMotion]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    if (!hasFiredFirstMove.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      hasFiredFirstMove.current = true;
      onFirstMove?.();
    }

    rawY.set(clamp(dx * SENSITIVITY));
    rawX.set(clamp(dy * -SENSITIVITY)); // 반전: 위로 드래그 → 앞으로 기울임
  }, [rawX, rawY, onFirstMove]);

  const release = useCallback(() => {
    startPos.current = null;
    setIsDragging(false);
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  // reduced-motion 일 때 no-op 핸들러
  if (reducedMotion) {
    return {
      rotateX,
      rotateY,
      isDragging: false,
      handlers: {
        onPointerDown: () => {},
        onPointerMove: () => {},
        onPointerUp: () => {},
        onPointerCancel: () => {},
      },
    };
  }

  return {
    rotateX,
    rotateY,
    isDragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerCancel: release,
    },
  };
}
