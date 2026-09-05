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
import { GB, EASE_OUT, GB_ENEMY, GB_LEGEND, GB_WARN } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import type { Language } from "@/types/game";
import { equipmentNameById } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";
import {
  ENHANCE_TITLE_LEVELS,
  getEnhanceTitle,
  type EnhanceGuardSpend,
  type Equipment,
} from "@/types/uphero";

/**
 * Phase 5-B — 다섯 갈래 모두 `spent`(이번 시도에 나간 방지권)를 싣는다. 시도당
 * 소모라 성공/유지/소실에서도 방지권이 나갈 수 있고, 모달이 그것을 한 줄씩 말한다.
 */
export type EnhanceModalVariant =
  | { kind: "success"; newItem: Equipment; prevLevel: number; spent: EnhanceGuardSpend }
  /** 실패했지만 아무 일도 없었던 경우. */
  | { kind: "keep"; item: Equipment; spent: EnhanceGuardSpend }
  /**
   * 방지권이 소실/하락을 막아준 경우 — 결과 문구가 "무엇을 막았는지" 를 말한다.
   */
  | {
      kind: "guarded";
      item: Equipment;
      guard: "destroy" | "down";
      spent: EnhanceGuardSpend;
    }
  /** 실패로 강화 단계가 1 내려간 경우. prevLevel 은 내려가기 전 레벨. */
  | { kind: "down"; item: Equipment; prevLevel: number; spent: EnhanceGuardSpend }
  | {
      kind: "destroyed";
      lostItemName: string;
      lostBaseId?: string;
      spent: EnhanceGuardSpend;
    };

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
  const { t, language } = useTranslation();

  // success 만 auto dismiss, keep/destroyed 는 유저 확인까지 대기.
  useEffect(() => {
    if (variant.kind !== "success") return;
    if (autoDismissMs <= 0) return;
    const id = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [variant.kind, autoDismissMs, onClose]);

  if (typeof window === "undefined") return null;

  const { title, tone, body, cta, icon, glow } = resolveVariant(variant, t, language);
  // Phase 5-B — 소모된 방지권을 한 줄씩. 시도당 소모라 어떤 결과에서도 나올 수 있다.
  const spentLines: string[] = [];
  if (variant.spent.destroy > 0) {
    spentLines.push(
      t("uphero.enhance.spent.line", { name: t("uphero.guard.destroy.name") }),
    );
  }
  if (variant.spent.down > 0) {
    spentLines.push(
      t("uphero.enhance.spent.line", { name: t("uphero.guard.down.name") }),
    );
  }

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
          boxShadow: glow ? `0 0 18px ${GB.lightest}55` : undefined,
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
          {spentLines.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5">
              {spentLines.map((line) => (
                <div key={line} className="typo-micro" style={{ color: GB.light }}>
                  {line}
                </div>
              ))}
            </div>
          )}
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
  language: Language,
): {
  title: string;
  tone: string;
  body: React.ReactNode;
  cta: string;
  icon: string;
  /** Phase 5-B — +15 이상 성공은 카드에 라임 글로우. */
  glow?: boolean;
} {
  if (variant.kind === "success") {
    const { newItem, prevLevel } = variant;
    const newLevel = newItem.enhanceLevel ?? prevLevel + 1;
    const localName = equipmentNameById(newItem.baseId ?? "", newItem.name, language);
    // Phase 5-B — 각성(+15..+19) / 초월(+20) 타이틀 + 칭호 칩 + 새 스탯 한 줄.
    const enhanceTitle = getEnhanceTitle(newLevel);
    const title =
      newLevel >= ENHANCE_TITLE_LEVELS.transcended
        ? t("uphero.enhance.success.transcendTitle")
        : newLevel >= ENHANCE_TITLE_LEVELS.awakened
          ? t("uphero.enhance.success.awakenTitle")
          : t("uphero.enhance.success.fullTitle");
    const tone =
      newLevel >= ENHANCE_TITLE_LEVELS.awakened
        ? GB.lightest
        : newLevel >= 10
          ? GB_LEGEND
          : GB.lightest;
    const statLine = Object.entries(newItem.stats)
      .filter(([, v]) => v != null && v !== 0)
      .map(([k, v]) => `${k.toUpperCase()} +${v}${k === "crit" ? "%" : ""}`)
      .join(" · ");
    return {
      title,
      tone,
      glow: newLevel >= ENHANCE_TITLE_LEVELS.awakened,
      icon: "Check",
      body: (
        <>
          {enhanceTitle && (
            <span
              className="typo-micro inline-block mb-1 px-1.5 rounded-sm"
              style={{ background: `${GB.lightest}22`, color: GB.lightest }}
              aria-label={t("uphero.enhance.title.chipAria", {
                title: t(`uphero.enhance.title.${enhanceTitle}` as const),
              })}
            >
              {t(`uphero.enhance.title.${enhanceTitle}` as const)}
            </span>
          )}
          <div style={{ color: GB.lightest, fontWeight: 600 }}>
            {localName}
          </div>
          <div className="mt-1.5 tabular-nums">
            +{prevLevel} → <span style={{ color: GB.lightest }}>+{newLevel}</span>
          </div>
          {statLine && (
            <div className="mt-1 typo-micro tabular-nums" style={{ color: GB.light }}>
              {statLine}
            </div>
          )}
        </>
      ),
      cta: t("uphero.enhance.continue"),
    };
  }
  if (variant.kind === "keep") {
    const localName = equipmentNameById(
      variant.item.baseId ?? "",
      variant.item.name,
      language,
    );
    return {
      title: t("uphero.enhance.fail.keepTitle"),
      tone: GB_WARN,
      icon: "WarningDiamond",
      body: <div style={{ color: GB.lightest }}>{localName}</div>,
      cta: t("uphero.enhance.continue"),
    };
  }
  if (variant.kind === "guarded") {
    // 방지권이 막아낸 순간. 무엇을 막았는지가 핵심 정보다 — 소실을 막은 것과
    // 하락을 막은 것은 유저가 다음에 무엇을 아껴야 하는지를 바꾼다.
    const localName = equipmentNameById(
      variant.item.baseId ?? "",
      variant.item.name,
      language,
    );
    const guardName =
      variant.guard === "destroy"
        ? t("uphero.guard.destroy.name")
        : t("uphero.guard.down.name");
    return {
      title:
        variant.guard === "destroy"
          ? t("uphero.enhance.guarded.destroyTitle")
          : t("uphero.enhance.guarded.downTitle"),
      tone: GB.lightest,
      icon: "Shield",
      body: (
        <>
          <div style={{ color: GB.lightest }}>{localName}</div>
          <div className="mt-1.5">
            {t("uphero.enhance.guarded.body", { name: guardName })}
          </div>
        </>
      ),
      cta: t("uphero.enhance.continue"),
    };
  }
  if (variant.kind === "down") {
    // 하락. 아이템은 남았지만 단계가 내려갔으므로 "+7 → +6" 을 성공과 같은 형식으로
    // 보여준다 — 같은 자리에 같은 문법으로 두어야 방향의 차이가 읽힌다.
    const localName = equipmentNameById(
      variant.item.baseId ?? "",
      variant.item.name,
      language,
    );
    const newLevel = variant.item.enhanceLevel ?? Math.max(0, variant.prevLevel - 1);
    return {
      title: t("uphero.enhance.down.title"),
      tone: GB_WARN,
      icon: "ArrowDown",
      body: (
        <>
          <div style={{ color: GB.lightest }}>{localName}</div>
          <div className="mt-1.5 tabular-nums">
            +{variant.prevLevel} → <span style={{ color: GB_WARN }}>+{newLevel}</span>
          </div>
        </>
      ),
      cta: t("uphero.enhance.continue"),
    };
  }
  // destroyed
  const localName = equipmentNameById(
    variant.lostBaseId ?? "",
    variant.lostItemName,
    language,
  );
  return {
    title: t("uphero.enhance.destroyed.title"),
    tone: GB_ENEMY,
    icon: "Skull",
    body: (
      <>
        <div style={{ color: GB_ENEMY, fontWeight: 600 }}>
          {localName}
        </div>
      </>
    ),
    cta: t("uphero.enhance.comfort"),
  };
}
