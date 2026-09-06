"use client";

/**
 * Phase 6-E (Track E, 피드백 22) — 가방 초과 전리품 처리 모달.
 *
 * 격자 가방 이전의 개수 상한을 넘겨 `overflowDrops` 에 남은 드롭을 비우는 배수로다.
 * (지금은 새로 쌓이지 않는다. 정산은 트레이 소프트캡으로 처리한다.) 이 모달은 캠프에서
 * 목록이 빌 때까지 닫히지 않는다 (배경 탭·Escape 무시). 한 개씩 판매/버리기, 또는 모두
 * 판매. 마운트 게이트(세션 없음 · 레벨업 오버레이 없음 · 전직 제안 없음) 는 호출측
 * (CampPlaceholder) 이 잡는다 — 오버레이 순서: HeroLevelUpOverlay → ClassChoiceModal →
 * 이 모달.
 *
 * 보더 없음. 배경 단계와 라임 글로우로 위계를 만든다.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { sellPrice } from "@/types/uphero";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById } from "@/lib/upHeroI18n";
import EquipmentCard from "./EquipmentCard";
import PixelIcon from "@/components/icons/PixelIcon";

interface BagOverflowModalProps {
  onNotify?: (msg: string) => void;
}

const noop = () => {};

export default function BagOverflowModal({ onNotify }: BagOverflowModalProps) {
  const { t, language } = useTranslation();
  const overflowDrops = useUpHeroStore((s) => s.overflowDrops);
  const resolveOverflowItem = useUpHeroStore((s) => s.resolveOverflowItem);
  const sellAllOverflow = useUpHeroStore((s) => s.sellAllOverflow);
  const { play } = useSound();
  const containerRef = useRef<HTMLDivElement>(null);
  // 닫기 불가 — Escape 는 무시한다 (onClose 가 no-op).
  useModalA11y(containerRef, noop, {
    disabled: overflowDrops.length === 0,
    noEscape: true,
  });

  if (overflowDrops.length === 0) return null;
  if (typeof window === "undefined") return null;

  const total = overflowDrops.reduce(
    (sum, item) => sum + sellPrice(item.rarity, item.dropFloor, item.enhanceLevel),
    0,
  );

  const onSellOne = (id: string) => {
    const refund = resolveOverflowItem(id, "sell");
    play("collect");
    onNotify?.(t("uphero.equip.toast.overflowSold", { coins: refund }));
  };
  const onDiscardOne = (id: string) => {
    resolveOverflowItem(id, "discard");
    play("cancel");
    onNotify?.(t("uphero.equip.toast.discarded"));
  };
  const onSellAll = () => {
    const coins = sellAllOverflow();
    play("collect");
    onNotify?.(t("uphero.equip.toast.overflowSold", { coins }));
  };

  return createPortal(
    <div
      className="bag-overflow-backdrop fixed inset-0 z-[66] flex items-end sm:items-center justify-center p-4"
      style={{ background: `${GB.darkest}e6` }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bag-overflow-title"
        className="bag-overflow-card w-full max-w-sm rounded-md flex flex-col"
        style={{
          background: GB.darkest,
          boxShadow: `0 0 18px ${GB.lightest}33`,
          outline: "none",
          maxHeight: "min(80vh, 560px)",
        }}
      >
        <div className="px-4 pt-4 pb-2 flex items-start gap-2 shrink-0">
          <PixelIcon name="Briefcase" size={16} color={GB.lightest} />
          <div className="flex-1 min-w-0">
            <div
              id="bag-overflow-title"
              className="typo-body leading-snug"
              style={{ color: GB.lightest }}
            >
              {t("uphero.equip.overflow.title")}
            </div>
            <div className="typo-caption mt-1" style={{ color: GB.light }}>
              {t("uphero.equip.overflow.body", { n: overflowDrops.length })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
          {overflowDrops.map((item) => {
            const price = sellPrice(item.rarity, item.dropFloor, item.enhanceLevel);
            const name = equipmentNameById(item.baseId ?? "", item.name, language);
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded px-2 py-2"
                style={{ background: `${GB.dark}66` }}
              >
                <div style={{ width: 72, flexShrink: 0 }}>
                  <EquipmentCard equipment={item} size="sm" style={{ minHeight: 96 }} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="typo-caption truncate" style={{ color: GB.lightest }}>
                    {name}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSellOne(item.id)}
                      className="bag-overflow-btn typo-caption rounded tabular-nums flex-1"
                      style={{
                        minHeight: 44,
                        padding: "8px 10px",
                        background: GB.lightest,
                        color: GB.darkest,
                        border: "none",
                        fontWeight: 600,
                      }}
                    >
                      {t("uphero.equip.overflow.sellOne", { price })}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDiscardOne(item.id)}
                      className="bag-overflow-btn typo-caption rounded"
                      style={{
                        minHeight: 44,
                        padding: "8px 10px",
                        background: `${GB.dark}aa`,
                        color: GB.light,
                        border: "none",
                      }}
                    >
                      {t("uphero.equip.overflow.discardOne")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-3 py-3 shrink-0">
          <button
            type="button"
            onClick={onSellAll}
            className="bag-overflow-btn typo-caption rounded w-full tabular-nums"
            style={{
              minHeight: 52,
              padding: "10px 14px",
              background: GB.lightest,
              color: GB.darkest,
              border: "none",
              fontWeight: 600,
              boxShadow: `0 0 12px ${GB.lightest}55`,
            }}
          >
            {t("uphero.equip.overflow.sellAll", { coins: total })}
          </button>
        </div>
      </div>
      <style jsx>{`
        .bag-overflow-backdrop {
          animation: bag-overflow-fade 180ms ${EASE_OUT} both;
        }
        .bag-overflow-card {
          animation: bag-overflow-in 220ms ${EASE_OUT} both;
        }
        .bag-overflow-btn {
          transition: transform 120ms ${EASE_OUT};
        }
        .bag-overflow-btn:active {
          transform: scale(0.97);
        }
        @keyframes bag-overflow-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes bag-overflow-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bag-overflow-backdrop,
          .bag-overflow-card {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
