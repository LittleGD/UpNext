"use client";

/**
 * Phase 12f — 던전 인터랙션 도움말 모달.
 *
 * 전투 중 ? 버튼 탭 시 열림. 자원 / 스킬 / 미니게임 / 포기 등 주요 인터랙션을
 * 한 화면에 정리. reduced-motion + useModalA11y 지원.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import PixelIcon from "@/components/icons/PixelIcon";

interface DungeonHelpModalProps {
  onClose: () => void;
}

// Phase 12 i18n — 항목을 i18n key 로 보관. 렌더 시점에 t() 조회.
const HELP_ITEMS: Array<{ icon: string; titleKey: DictKey; descKey: DictKey }> = [
  {
    icon: "Heart",
    titleKey: "uphero.help.item.hpTime.title",
    descKey: "uphero.help.item.hpTime.desc",
  },
  {
    icon: "Zap",
    titleKey: "uphero.help.item.resource.title",
    descKey: "uphero.help.item.resource.desc",
  },
  {
    icon: "Star",
    titleKey: "uphero.help.item.skill.title",
    descKey: "uphero.help.item.skill.desc",
  },
  {
    icon: "Play",
    titleKey: "uphero.help.item.speed.title",
    descKey: "uphero.help.item.speed.desc",
  },
  {
    icon: "Flag",
    titleKey: "uphero.help.item.abandon.title",
    descKey: "uphero.help.item.abandon.desc",
  },
];

export default function DungeonHelpModal({ onClose }: DungeonHelpModalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, { noScrollLock: true });
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      style={{ background: `${GB.darkest}dd` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.lightest}`,
          outline: "none",
        }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <div
            id="help-title"
            className="typo-body"
            style={{ color: GB.lightest, fontWeight: 600 }}
          >
            {t("uphero.help.title")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="typo-caption rounded inline-flex items-center justify-center"
            style={{
              minHeight: 44,
              minWidth: 44,
              padding: "8px 12px",
              background: "transparent",
              color: GB.light,
              border: `1px solid ${GB.dark}`,
            }}
            aria-label={t("uphero.help.close")}
          >
            {t("uphero.help.close")}
          </button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          {HELP_ITEMS.map((item) => (
            <div key={item.titleKey} className="flex items-start gap-2.5">
              <div
                className="rounded p-1 mt-0.5 shrink-0"
                style={{ background: `${GB.dark}aa` }}
              >
                <PixelIcon name={item.icon} size={14} color={GB.lightest} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="typo-caption"
                  style={{ color: GB.lightest, fontWeight: 600 }}
                >
                  {t(item.titleKey)}
                </div>
                <div className={`typo-micro ${gbClass.textDim}`}>
                  {t(item.descKey)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <style jsx>{`
          div[role="dialog"] {
            animation: help-in 220ms ${EASE_OUT} both;
          }
          @keyframes help-in {
            from {
              opacity: 0;
              transform: scale(0.97);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            div[role="dialog"] {
              animation: none;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}
