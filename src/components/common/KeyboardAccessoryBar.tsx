"use client";

/**
 * KeyboardAccessoryBar — iOS Safari/Android 에서 키보드가 올라올 때, 키보드 바로
 * 위에 떠서 "완료 / 취소" 를 제공하는 액세서리 바.
 *
 * 왜 필요한가
 *  - 유저가 textarea/input 에 포커스를 넣었을 때 "밖 터치로 blur" 만이 유일한
 *    완료 경로면, 글자가 짧은 메모에서는 OK 해도 긴 메모는 카펫 위 탭 판정이
 *    애매해진다. 명시적 "완료" 버튼 + "취소(되돌리기)" 버튼이 있으면 유저 의도
 *    완결.
 *
 * 구현 전략
 *  - `visualViewport` API 로 키보드 높이를 추정 (layoutViewport - visualViewport).
 *    iOS Safari: OSK 올라오면 visualViewport.height 가 줄어듦.
 *  - 떠있는 위치는 viewport 하단 + VV offset. 키보드 위 safe-area-inset-bottom 과
 *    ≈ 동일.
 *  - visualViewport 미지원 (구식 브라우저) → 그냥 fixed bottom:0. 동작은 하지만
 *    키보드에 덮일 수 있음 → fallback 용.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  /** 바 표시 여부 — input 포커스 상태를 그대로 전달. */
  visible: boolean;
  /** "완료" — 현재 값을 commit 하고 blur. */
  onDone: () => void;
  /** "취소" — 변경을 rollback 하고 blur. */
  onCancel: () => void;
  /** Done/Cancel 라벨 커스텀 (default: i18n common.done/cancel). */
  doneLabel?: string;
  cancelLabel?: string;
}

/**
 * visualViewport.offsetTop 과 height 로 키보드 위쪽 y 좌표를 계산.
 *   bottom = window.innerHeight − (vv.offsetTop + vv.height).
 *   keyboard 없을 때는 bottom = 0 근처 (safe-area 감안).
 */
function getKeyboardOffset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const bottom = window.innerHeight - (vv.offsetTop + vv.height);
  return Math.max(0, bottom);
}

export default function KeyboardAccessoryBar({
  visible,
  onDone,
  onCancel,
  doneLabel,
  cancelLabel,
}: Props) {
  const { t } = useTranslation();
  const [kbOffset, setKbOffset] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKbOffset(getKeyboardOffset());
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [visible]);

  if (!mounted || !visible || typeof window === "undefined") return null;

  const doneText = doneLabel ?? t("common.done");
  const cancelText = cancelLabel ?? t("common.cancel");

  return createPortal(
    <div
      role="toolbar"
      aria-label={doneText}
      className="fixed left-0 right-0 z-[110] flex items-center justify-between gap-2 px-3 py-2"
      style={{
        bottom: kbOffset,
        background: "var(--bg-elevated, #1e1e1e)",
        borderTop: "1px solid var(--border-default, rgba(255,255,255,0.12))",
        paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        // mousedown 이 textarea blur 를 먼저 일으키지 않도록 — iOS 에서는
        // touchstart/pointerdown 에서 preventDefault 하면 blur skip. 버튼 onClick
        // 은 onPointerDown preventDefault 와 공존 가능.
        touchAction: "manipulation",
      }}
      onPointerDown={(e) => {
        // blur 를 막아 현재 포커스 유지 → 버튼 클릭 시점까지 textarea 값 stable.
        e.preventDefault();
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 typo-caption rounded-md"
        style={{
          minHeight: 40,
          color: "var(--text-secondary, #aaa)",
          background: "transparent",
          border: "1px solid var(--border-default, rgba(255,255,255,0.16))",
        }}
      >
        {cancelText}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="flex-1 typo-caption rounded-md"
        style={{
          minHeight: 40,
          color: "var(--bg-primary, #000)",
          background: "var(--accent, #ffd84a)",
          border: "1px solid var(--accent, #ffd84a)",
          fontWeight: 600,
        }}
      >
        {doneText}
      </button>
    </div>,
    document.body,
  );
}
