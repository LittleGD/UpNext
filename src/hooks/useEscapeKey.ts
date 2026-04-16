"use client";

import { useEffect } from "react";

/**
 * ESC 키로 모달/오버레이를 닫게 해주는 접근성 훅.
 * 모바일 키보드 + 데스크탑 키보드 유저 공통 — 모달 누적 시 가장 위에서만 동작하도록
 * `enabled` 플래그로 조건부 바인딩 가능.
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.stopPropagation();
        onEscape();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape, enabled]);
}
