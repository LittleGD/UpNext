"use client";

/**
 * Phase 9a — GB 팔레트 confirm 다이얼로그.
 *
 * 기존 `window.confirm()` 5곳 (판매/버리기/포기/바인딩/강화) 을 교체.
 * native 알럿은 흰색 iOS 시스템 다이얼로그라 Up Hero 풀스크린 세계관의
 * 몰입을 깨는 원인. 또한 포커스 트랩/Esc 대응이 OS 에 맡겨져 일관성 없음.
 *
 * 사용 패턴 (imperative API):
 * ```tsx
 * const confirm = useGbConfirm();
 * const ok = await confirm({ title: "판매할까요?", body: "+80 C", confirmLabel: "판매" });
 * ```
 *
 * 또는 controlled:
 * ```tsx
 * <GbConfirm open={...} onConfirm={...} onCancel={...} title="..." />
 * ```
 *
 * 이 파일은 controlled 컴포넌트만 제공. imperative API 는 필요할 때 추가.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";

interface GbConfirmProps {
  open: boolean;
  title: string;
  /** 추가 설명 — 경고 / 비용 / 결과 예측 등 */
  body?: ReactNode;
  /**
   * Phase 5-B — body 아래에 붙는 섹션 슬롯. 방지권 패널처럼 "본문과 구분되는 선택
   * 영역" 을 GbConfirmPanel 로 쌓는다. body 와 달리 세로 gap 을 갖는 컨테이너다.
   */
  sections?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 위험 액션 — 판매/버리기/포기 같은 복구 불가 동작. 붉은 톤. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Phase 5-B — 확인 다이얼로그 안의 섹션 패널. 배경 단계(어두운 dark → active 면
 * dark 원색)와 라임 글로우로 "걸림" 을 말한다. 보더는 쓰지 않는다 — 카드/버튼
 * 보더 금지 규칙. `trailing` 은 헤더 오른쪽 칩(보유 개수 등) 자리다.
 */
export function GbConfirmPanel({
  active,
  title,
  trailing,
  children,
}: {
  active: boolean;
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      style={{
        background: active ? GB.dark : `${GB.dark}88`,
        borderRadius: 6,
        padding: "8px 10px",
        boxShadow: active ? `0 0 10px ${GB.lightest}44` : "none",
        transition: `box-shadow 160ms ${EASE_OUT}, background 160ms ${EASE_OUT}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="typo-caption"
          style={{ color: active ? GB.lightest : GB.light, fontWeight: 600 }}
        >
          {title}
        </span>
        {trailing}
      </div>
      {children}
    </section>
  );
}

export default function GbConfirm({
  open,
  title,
  body,
  sections,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: GbConfirmProps) {
  const { t } = useTranslation();
  const confirmText = confirmLabel ?? t("common.confirmDefault");
  const cancelText = cancelLabel ?? t("common.cancelDefault");
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onCancel, { disabled: !open });

  // mount transition — scale 0.95 → 1 + fade
  const mountedRef = useRef(false);
  useEffect(() => {
    if (open) {
      // 아주 짧은 delay 뒤 mounted 상태로 → CSS 트랜지션 재생
      const id = requestAnimationFrame(() => {
        mountedRef.current = true;
        if (containerRef.current) {
          containerRef.current.dataset.mounted = "true";
        }
      });
      return () => cancelAnimationFrame(id);
    }
    mountedRef.current = false;
  }, [open]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  const confirmColor = danger ? "#e88b7a" : GB.lightest;

  return createPortal(
    <div
      className="gb-confirm-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{
        background: `${GB.darkest}e0`,
      }}
      onClick={(e) => {
        // backdrop 탭 = 취소 (container 내부 클릭은 무시)
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gb-confirm-title"
        className="gb-confirm-card w-full max-w-xs rounded-md"
        style={{
          background: GB.darkest,
          border: `1px solid ${confirmColor}`,
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          className="px-4 pt-4 pb-2 flex items-start gap-2"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <PixelIcon
            name={danger ? "WarningDiamond" : "InfoBox"}
            size={16}
            color={confirmColor}
          />
          <div
            id="gb-confirm-title"
            className="typo-body flex-1 leading-snug"
            style={{ color: GB.lightest }}
          >
            {title}
          </div>
        </div>
        {/* Body */}
        {body && (
          <div
            className="px-4 py-3 typo-caption leading-relaxed"
            style={{ color: GB.light }}
          >
            {body}
          </div>
        )}
        {/* Phase 5-B — 섹션 슬롯 (방지권 패널 등). */}
        {sections && (
          <div className="px-3 pb-3 flex flex-col gap-2">{sections}</div>
        )}
        {/* Footer — 확인 primary, 취소 secondary */}
        <div
          className="px-3 py-3 flex items-center gap-2 justify-end"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="gb-confirm-btn typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 14px",
              background: "transparent",
              color: GB.light,
              border: `1px solid ${GB.light}`,
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="gb-confirm-btn gb-confirm-primary typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 14px",
              background: confirmColor,
              color: GB.darkest,
              border: `1px solid ${confirmColor}`,
              fontWeight: 600,
            }}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style jsx>{`
        .gb-confirm-backdrop {
          animation: gb-confirm-fade 180ms ${EASE_OUT} both;
        }
        .gb-confirm-card {
          animation: gb-confirm-in 200ms ${EASE_OUT} both;
        }
        .gb-confirm-btn {
          transition: transform 120ms ${EASE_OUT}, filter 160ms ${EASE_OUT};
        }
        .gb-confirm-btn:active {
          transform: scale(0.97);
        }
        .gb-confirm-btn:hover {
          filter: brightness(1.06);
        }
        @keyframes gb-confirm-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes gb-confirm-in {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gb-confirm-backdrop,
          .gb-confirm-card {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
