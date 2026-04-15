"use client";

import { useMediaQuery } from "./useMediaQuery";

/**
 * prefers-reduced-motion 미디어 쿼리 래퍼.
 * 3D 효과, 자이로, 홀로그래픽 오버레이 등을 조건부로 비활성화할 때 사용.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
