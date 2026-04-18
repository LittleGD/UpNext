"use client";

/**
 * Phase 11c R4 — 글로벌 screen reader announcer.
 *
 * 게임 진행 중 시각 float (+XP, +coin, 스킬 발동, HP regen) 은 모두 `aria-hidden`
 * 이라 스크린 리더 유저에게 완전히 묵음. 공용 live region 하나를 `document.body`
 * 에 portal-fixed 로 유지하고, 어떤 컴포넌트든 `announce(msg)` 호출로 공지 가능.
 *
 * 구현:
 *   - 두 개의 전용 노드 유지: polite (기본) / assertive (중요).
 *   - `announce(text, priority?)` 로 텍스트 push → 100ms 내 clear (다음 메시지 재공지
 *     가능하도록). 연속 push 는 queue 로 rate-limit (최소 400ms 간격) — 자주 깨지는
 *     음성 피드백 방지.
 *   - 초기 mount 는 idempotent (여러 hook 이 동시에 호출해도 노드 1쌍만 생성).
 *
 * 사용:
 * ```ts
 * const { announce } = useAnnounce();
 * announce("스킬 강타 발동");              // polite
 * announce("F30 최초 돌파!", "assertive"); // 중단 공지
 * ```
 *
 * SR 전용 — 시각 렌더에는 영향 없음. `.sr-only` (globals.css) 스타일 사용.
 */

import { useCallback, useEffect, useRef } from "react";

let politeNode: HTMLDivElement | null = null;
let assertiveNode: HTMLDivElement | null = null;
let lastPoliteAt = 0;
let lastAssertiveAt = 0;
let politeQueue: string[] = [];
let assertiveQueue: string[] = [];
const MIN_INTERVAL_MS = 400;
const CLEAR_DELAY_MS = 120;

function ensureNodes(): void {
  if (typeof document === "undefined") return;
  if (!politeNode) {
    const n = document.createElement("div");
    n.setAttribute("role", "status");
    n.setAttribute("aria-live", "polite");
    n.setAttribute("aria-atomic", "true");
    n.className = "sr-only";
    n.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    document.body.appendChild(n);
    politeNode = n;
  }
  if (!assertiveNode) {
    const n = document.createElement("div");
    n.setAttribute("role", "alert");
    n.setAttribute("aria-live", "assertive");
    n.setAttribute("aria-atomic", "true");
    n.className = "sr-only";
    n.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    document.body.appendChild(n);
    assertiveNode = n;
  }
}

function flushPolite(): void {
  if (!politeNode) return;
  const next = politeQueue.shift();
  if (next == null) return;
  politeNode.textContent = next;
  lastPoliteAt = Date.now();
  window.setTimeout(() => {
    if (politeNode) politeNode.textContent = "";
  }, CLEAR_DELAY_MS);
  if (politeQueue.length > 0) {
    window.setTimeout(flushPolite, MIN_INTERVAL_MS);
  }
}

function flushAssertive(): void {
  if (!assertiveNode) return;
  const next = assertiveQueue.shift();
  if (next == null) return;
  assertiveNode.textContent = next;
  lastAssertiveAt = Date.now();
  window.setTimeout(() => {
    if (assertiveNode) assertiveNode.textContent = "";
  }, CLEAR_DELAY_MS);
  if (assertiveQueue.length > 0) {
    window.setTimeout(flushAssertive, MIN_INTERVAL_MS);
  }
}

export function useAnnounce(): {
  announce: (text: string, priority?: "polite" | "assertive") => void;
} {
  const mountedRef = useRef(false);
  useEffect(() => {
    ensureNodes();
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const announce = useCallback(
    (text: string, priority: "polite" | "assertive" = "polite") => {
      if (!text.trim()) return;
      ensureNodes();
      if (priority === "assertive") {
        assertiveQueue.push(text);
        if (Date.now() - lastAssertiveAt >= MIN_INTERVAL_MS) flushAssertive();
      } else {
        politeQueue.push(text);
        if (Date.now() - lastPoliteAt >= MIN_INTERVAL_MS) flushPolite();
      }
    },
    [],
  );

  return { announce };
}

/** 테스트 / 정리용 — 노드 제거. (HMR 재주입 대비) */
export function _resetAnnounceNodes(): void {
  if (politeNode?.parentNode) politeNode.parentNode.removeChild(politeNode);
  if (assertiveNode?.parentNode) assertiveNode.parentNode.removeChild(assertiveNode);
  politeNode = null;
  assertiveNode = null;
  politeQueue = [];
  assertiveQueue = [];
}
