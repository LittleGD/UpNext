"use client";

/**
 * Phase 9a — 모달/풀스크린 오버레이용 접근성 통합 훅.
 *
 * 개별 hook (useEscapeKey + useScrollLock) 을 묶고 +
 *  - focus trap: Tab / Shift+Tab 이 컨테이너 안에서만 순환
 *  - initial focus: 컨테이너 진입 시 첫 focusable 또는 closeRef 에 포커스
 *  - 외부 복귀: 모달 닫힐 때 원래 trigger 로 focus 복원
 *
 * 사용:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useModalA11y(containerRef, onClose);
 * return <div ref={containerRef} role="dialog" aria-modal="true">...</div>;
 * ```
 *
 * 왜 한 훅으로 묶는가:
 *  - 5개 모달 (HeroStatPanel, SessionResultModal, DungeonView, PhotoTalismanPicker,
 *    ClassAwakenModal) 이 같은 a11y 계약을 공유해야 함
 *  - 각각 Esc + scrollLock + focus trap 따로 구현하면 누락 확률 ↑
 *  - Tab 키로 탈출해 배경 UI 와 섞이는 문제 (iPad + Magic Keyboard) 방지
 */

import { useEffect, type RefObject } from "react";
import { useEscapeKey } from "./useEscapeKey";
import { useScrollLock } from "./useScrollLock";

interface UseModalA11yOptions {
  /** 닫기 콜백 비활성 (nested modal 등) */
  disabled?: boolean;
  /** Esc 닫기 비활성 (confirm dialog 처럼 explicit 만 허용) */
  noEscape?: boolean;
  /** body scrollLock 비활성 (Portal 이 scroll 자체 먹고 있으면 불필요) */
  noScrollLock?: boolean;
}

/**
 * @param containerRef 모달 루트 엘리먼트 (role="dialog" 권장)
 * @param onClose 닫기 콜백 — Esc 키 눌림 시 호출
 */
export function useModalA11y(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: UseModalA11yOptions = {},
): void {
  const { disabled = false, noEscape = false, noScrollLock = false } = opts;

  useEscapeKey(onClose, !disabled && !noEscape);
  useScrollLock(!disabled && !noScrollLock);

  // Focus trap + initial focus + restore on unmount
  useEffect(() => {
    if (disabled) return;
    const container = containerRef.current;
    if (!container) return;

    // 1) 원래 focus 된 요소 기억 — 모달 닫힐 때 복원
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 2) 첫 focusable 에 initial focus — 없으면 container 자체에
    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null); // 보이는 것만

    const initial = focusables()[0] ?? container;
    // container 자체에 포커스 주려면 tabIndex 가 필요 — 없으면 속성 부여
    if (initial === container && !container.hasAttribute("tabindex")) {
      container.setAttribute("tabindex", "-1");
    }
    initial.focus({ preventScroll: true });

    // 3) Tab / Shift+Tab 을 container 안에서만 순환
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    container.addEventListener("keydown", onKey);

    return () => {
      container.removeEventListener("keydown", onKey);
      // 모달 닫히면 원래 포커스 된 곳으로 복원 (모바일에서는 시스템이 무시할 수 있음)
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [containerRef, disabled]);
}
