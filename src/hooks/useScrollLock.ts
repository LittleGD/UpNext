"use client";

import { useEffect } from "react";

/**
 * 모달/오버레이가 열려있는 동안 배경 스크롤을 확실히 잠근다.
 *
 * 단순 `document.body.style.overflow = 'hidden'`은 body가 viewport보다 짧은 경우에만
 * 유효하며, Android Chrome / TWA 등에서는 html 엘리먼트가 document scroller 역할을
 * 하기 때문에 배경이 계속 스크롤되는 누수가 발생한다.
 *
 * html + body 둘 다 `overflow: hidden`을 걸고, cleanup 시 원래 값으로 복원한다.
 *
 * === Reference counting ===
 * 여러 모달이 동시에 열릴 수 있는 상황(예: SyncProvider 가 지연 후 PatchNotesModal 을
 * 띄우는 도중 DailyBoard 에서 ChallengeConfirmModal 이 이미 열려 있는 경우)을 대비해
 * 모듈 스코프 카운터로 활성 락 수를 추적한다. **첫 락만** 원래 overflow 값을
 * 스냅샷하고, **마지막 락이 풀릴 때만** 원래 값으로 복원한다. 중간에 unmount 되는
 * 락은 counter 만 감소시켜 남은 모달의 잠금을 유지한다.
 */
let lockCount = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";

export function useScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;

    if (lockCount === 0) {
      // 최초 락 — 현재 overflow 값을 스냅샷한 뒤 hidden 으로 교체
      savedHtmlOverflow = html.style.overflow;
      savedBodyOverflow = body.style.overflow;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    }
    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        // 마지막 락 해제 — 원래 값 복원
        html.style.overflow = savedHtmlOverflow;
        body.style.overflow = savedBodyOverflow;
      }
    };
  }, [active]);
}
