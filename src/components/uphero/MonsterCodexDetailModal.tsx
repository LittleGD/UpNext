"use client";

/**
 * Phase 12 — 몬스터 도감 디테일 모달.
 *
 * MonsterCodex 의 카드 탭 → 이 모달 오픈. 몬스터의 lore, 던전, 등급 표시.
 * 미발견 몬스터는 그리드에서 disabled 상태라 모달 자체가 열리지 않음 (detail
 * 을 통한 spoiler 노출 방지).
 *
 * a11y: useModalA11y (Esc close, focus trap, backdrop click close).
 * 애니: scale(0.97 → 1) + opacity — DungeonHelpModal 패턴 재사용.
 */

import { useRef } from "react";
import { createPortal } from "react-dom";
import { GB, EASE_OUT, GB_ENEMY, gbClass } from "@/lib/upHeroPalette";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { monsterNameById, dungeonName } from "@/lib/upHeroI18n";
import MonsterSprite from "./MonsterSprite";
import PixelIcon from "@/components/icons/PixelIcon";
import { DUNGEONS } from "@/data/upHeroDungeons";
import type { MonsterTemplate } from "@/data/upHeroMonsters";
import { getMonsterLore } from "@/data/upHeroMonsterLore";

interface MonsterCodexDetailModalProps {
  template: MonsterTemplate;
  onClose: () => void;
}

export default function MonsterCodexDetailModal({
  template,
  onClose,
}: MonsterCodexDetailModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, { noScrollLock: true });
  const { t, language } = useTranslation();
  const closeAria = t("uphero.codex.detail.close.aria");
  if (typeof window === "undefined") return null;

  const lore = getMonsterLore(template.id, template.kind);
  const displayName = monsterNameById(template.id, template.name, language);
  const dungeon = template.dungeonId
    ? DUNGEONS[template.dungeonId]
    : undefined;
  const accent = template.isBoss ? GB_ENEMY : GB.lightest;

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
        aria-labelledby="monster-codex-title"
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${accent}`,
          outline: "none",
        }}
      >
        {/* Header — 이름 + 닫기 */}
        <div
          className="px-4 py-3 flex items-center justify-between gap-2"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              id="monster-codex-title"
              className="typo-body truncate"
              style={{ color: accent, fontWeight: 600 }}
            >
              {displayName}
            </div>
            {template.isBoss && (
              <span
                className="typo-micro px-1.5 py-0.5 rounded-sm shrink-0"
                style={{
                  color: GB_ENEMY,
                  background: `${GB_ENEMY}22`,
                  border: `1px solid ${GB_ENEMY}`,
                  letterSpacing: "0.08em",
                  fontSize: 10,
                }}
              >
                BOSS
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="typo-caption rounded px-2 py-1 shrink-0"
            style={{
              background: "transparent",
              color: GB.light,
              border: `1px solid ${GB.dark}`,
            }}
            aria-label={closeAria}
          >
            닫기
          </button>
        </div>

        {/* Sprite — 큰 사이즈로 강조 */}
        <div
          className="flex items-center justify-center py-6"
          style={{ background: `${GB.dark}33` }}
        >
          <MonsterSprite
            kind={template.kind}
            size={template.isBoss ? 80 : 72}
            color={accent}
          />
        </div>

        {/* Meta — 등장 던전 + 등급 */}
        <div className="px-4 pt-3 flex items-center gap-3 flex-wrap">
          {dungeon && (
            <div className="inline-flex items-center gap-1.5">
              <div
                className="rounded-full shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  background: dungeon.themeColor,
                }}
                aria-hidden="true"
              />
              <span
                className="typo-caption"
                style={{ color: GB.lightest }}
              >
                {dungeonName(dungeon.id, dungeon.name, language)}
              </span>
            </div>
          )}
          <div
            className={`typo-caption inline-flex items-center gap-1 ${gbClass.textDim}`}
            aria-label={`강도 ${template.power} / 3`}
            title={`상대 강도 ${template.power}`}
          >
            <PixelIcon name="Flame" size={12} color={GB.light} />
            <span className="tabular-nums">
              {"●".repeat(template.power)}
              <span style={{ opacity: 0.3 }}>
                {"●".repeat(3 - template.power)}
              </span>
            </span>
          </div>
        </div>

        {/* Lore — 본문 */}
        <div className="px-4 pt-3 pb-4">
          <div
            className="typo-caption leading-relaxed"
            style={{ color: GB.lightest, lineHeight: 1.7 }}
          >
            {lore}
          </div>
        </div>

        <style jsx>{`
          div[role="dialog"] {
            animation: monster-codex-in 220ms ${EASE_OUT} both;
          }
          @keyframes monster-codex-in {
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
