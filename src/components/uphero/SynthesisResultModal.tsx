"use client";

/**
 * Phase 6-E (Track E, 피드백 22) — 합성 결과 모달.
 *
 * 작은 포털 모달: 제목 + 결과 카드(md, RarityTexture 는 카드가 그린다) + 확인 버튼 하나.
 * 보더 없음, 라임 글로우로 "새 장비" 를 말한다.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import type { Equipment } from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById } from "@/lib/upHeroI18n";
import EquipmentCard from "./EquipmentCard";

interface SynthesisResultModalProps {
  item: Equipment;
  onClose: () => void;
}

export default function SynthesisResultModal({ item, onClose }: SynthesisResultModalProps) {
  const { t, language } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose);
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="synth-result-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: `${GB.darkest}e0` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="synth-result-title"
        className="synth-result-card w-full max-w-xs rounded-md flex flex-col items-center px-4 pt-4 pb-3 gap-3"
        style={{
          background: GB.darkest,
          boxShadow: `0 0 20px ${GB.lightest}44`,
          outline: "none",
        }}
      >
        <div
          id="synth-result-title"
          className="typo-body"
          style={{ color: GB.lightest, fontWeight: 600 }}
        >
          {t("uphero.equip.synth.resultTitle")}
        </div>
        <EquipmentCard equipment={item} size="md" />
        <div className="typo-caption text-center" style={{ color: GB.light }}>
          {t("uphero.equip.toast.synthesized", {
            name: equipmentNameById(item.baseId ?? "", item.name, language),
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="synth-result-btn typo-caption rounded w-full"
          style={{
            minHeight: 44,
            padding: "10px 14px",
            background: GB.lightest,
            color: GB.darkest,
            border: "none",
            fontWeight: 600,
          }}
          autoFocus
        >
          {t("uphero.equip.action.confirm")}
        </button>
      </div>
      <style jsx>{`
        .synth-result-backdrop {
          animation: synth-result-fade 180ms ${EASE_OUT} both;
        }
        .synth-result-card {
          animation: synth-result-in 220ms ${EASE_OUT} both;
        }
        .synth-result-btn {
          transition: transform 120ms ${EASE_OUT};
        }
        .synth-result-btn:active {
          transform: scale(0.97);
        }
        @keyframes synth-result-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes synth-result-in {
          from {
            opacity: 0;
            transform: scale(0.94);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .synth-result-backdrop,
          .synth-result-card {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
