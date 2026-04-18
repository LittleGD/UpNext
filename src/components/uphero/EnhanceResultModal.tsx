"use client";

/**
 * Up Hero — Phase 11a: 강화 결과 모달 (3 variants).
 *
 * 입력: EnhanceResult 에서 derive 된 variant.
 *   - success: "강화 성공 +N→+(N+1)" + 새 stats 표 + "계속" CTA (auto 2.4s)
 *   - keep   : "실패 — 아이템은 남았다" + 동일 아이템 + "계속"
 *   - destroyed: "{itemName} 이(가) 소실되었다" + GB_ENEMY 톤 + "위로" CTA
 *
 * 배경: EnhanceRitualOverlay 가 2초 연출 끝에 onDone → parent 가 이 모달로 전환.
 * reduced-motion 대응: 애니메이션 skip, 즉시 mounted.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT, GB_ENEMY, GB_LEGEND } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import PixelIcon from "@/components/icons/PixelIcon";
import type { Equipment } from "@/types/uphero";

export type EnhanceModalVariant =
  | { kind: "success"; newItem: Equipment; prevLevel: number }
  | { kind: "keep"; item: Equipment }
  | { kind: "destroyed"; lostItemName: string };

interface EnhanceResultModalProps {
  variant: EnhanceModalVariant;
  onClose: () => void;
  /** success 때만 자동 dismiss 타이머 (기본 2600ms). 0 이면 disable. */
  autoDismissMs?: number;
}

export default function EnhanceResultModal({
  variant,
  onClose,
  autoDismissMs = 2600,
}: EnhanceResultModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, { noScrollLock: true });
  const { t } = useTranslation();

  // success 만 auto dismiss, keep/destroyed 는 유저 확인까지 대기.
  useEffect(() => {
    if (variant.kind !== "success") return;
    if (autoDismissMs <= 0) return;
    const id = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [variant.kind, autoDismissMs, onClose]);

  if (typeof window === "undefined") return null;

  const { title, tone, body, cta, icon } = resolveVariant(variant, t);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: `${GB.darkest}e6` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="enhance-result-title"
        className="enhance-result-card w-full max-w-xs rounded-md"
        style={{
          background: GB.darkest,
          border: `1px solid ${tone}`,
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          className="px-4 pt-4 pb-3 flex items-start gap-2.5"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <PixelIcon name={icon} size={18} color={tone} />
          <div
            id="enhance-result-title"
            className="typo-body flex-1 leading-snug"
            style={{ color: tone, fontWeight: 600 }}
          >
            {title}
          </div>
        </div>

        {/* Body */}
        <div
          className="px-4 py-3 typo-caption leading-relaxed"
          style={{ color: GB.light }}
        >
          {body}
        </div>

        {/* Footer — CTA */}
        <div
          className="px-3 py-3 flex items-center justify-end"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="enhance-result-cta typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 18px",
              background: tone,
              color: GB.darkest,
              border: `1px solid ${tone}`,
              fontWeight: 600,
            }}
            autoFocus
          >
            {cta}
          </button>
        </div>

        <style jsx>{`
          .enhance-result-card {
            animation: enhance-result-in 220ms ${EASE_OUT} both;
          }
          .enhance-result-cta {
            transition: transform 120ms ${EASE_OUT};
          }
          .enhance-result-cta:active {
            transform: scale(0.97);
          }
          @keyframes enhance-result-in {
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
            .enhance-result-card {
              animation: none !important;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

/** variant 별 title / tone / body / cta / icon 결정. */
function resolveVariant(
  variant: EnhanceModalVariant,
  t: (key: DictKey, params?: Record<string, string | number>) => string,
): {
  title: string;
  tone: string;
  body: React.ReactNode;
  cta: string;
  icon: string;
} {
  if (variant.kind === "success") {
    const { newItem, prevLevel } = variant;
    const newLevel = newItem.enhanceLevel ?? prevLevel + 1;
    return {
      title: t("uphero.enhance.success.fullTitle"),
      tone: newLevel >= 10 ? GB_LEGEND : GB.lightest,
      icon: "Check",
      body: (
        <>
          <div style={{ color: GB.lightest, fontWeight: 600 }}>
            {newItem.name}
          </div>
          <div className="mt-1.5 tabular-nums">
            +{prevLevel} → <span style={{ color: GB.lightest }}>+{newLevel}</span>
          </div>
        </>
      ),
      cta: t("uphero.enhance.continue"),
    };
  }
  if (variant.kind === "keep") {
    return {
      title: t("uphero.enhance.fail.keepTitle"),
      tone: "#e8d88b", // GB_WARN
      icon: "WarningDiamond",
      body: (
        <>
          <div style={{ color: GB.lightest }}>{variant.item.name}</div>
        </>
      ),
      cta: t("uphero.enhance.continue"),
    };
  }
  // destroyed
  return {
    title: t("uphero.enhance.destroyed.title"),
    tone: GB_ENEMY,
    icon: "Skull",
    body: (
      <>
        <div style={{ color: GB_ENEMY, fontWeight: 600 }}>
          {variant.lostItemName}
        </div>
      </>
    ),
    cta: t("uphero.enhance.comfort"),
  };
}
