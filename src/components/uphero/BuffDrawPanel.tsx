"use client";

/**
 * Up Hero — Phase 4b: 던전 진입 전 버프 draw 패널.
 *
 * 흐름:
 *  1. pendingDungeon 이 set 되면 6장 카드 표시
 *  2. 사용자 N장 선택 (슬롯 수는 영웅 Lv + 장비 slotBonus 로 결정)
 *  3. "X장 선택 · 진입" → confirmDungeon, 탐험권 소모, 세션 시작
 *  4. "취소" → cancelBuffDraw, pendingDungeon 클리어
 *
 * 카드 미리보기 (BuffCardPreview):
 *  - rarity 테두리 + PixelIcon + 이름 + 버프 description 단문
 *  - 선택됨 상태: accent 배경 + 체크
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { getBuffSlotCount, getEffectiveHeroLevel } from "@/types/uphero";
import { getCardBuff } from "@/data/cardBuffs";
import { ALL_CARDS } from "@/data/cards";
import { DUNGEONS } from "@/data/upHeroDungeons";
import { GB, EASE_OUT, EASE_DRAWER, gbClass, GB_ENEMY, GB_LEGEND, GB_UNIQUE, GB_RARE } from "@/lib/upHeroPalette";
import type { ChallengeCard, Rarity } from "@/types/card";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { dungeonName, describeCardBuff } from "@/lib/upHeroI18n";
import { cardTitle } from "@/i18n";
import PixelIcon from "@/components/icons/PixelIcon";

const RARITY_COLOR: Record<Rarity, string> = {
  normal: GB.light,
  rare: GB_RARE,
  unique: GB_UNIQUE,
  legend: GB_LEGEND,
};

export default function BuffDrawPanel() {
  const { t, language } = useTranslation();
  const hero = useUpHeroStore((s) => s.hero);
  const pending = useUpHeroStore((s) => s.pendingDungeon);
  const confirmDungeon = useUpHeroStore((s) => s.confirmDungeon);
  const cancelBuffDraw = useUpHeroStore((s) => s.cancelBuffDraw);
  // Phase 9d — buff slot count 도 영웅 레벨 기반.
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const level = getEffectiveHeroLevel(gameLevel, heroStartLevel);
  const { play } = useSound();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (!pending) return null;

  const dungeon = DUNGEONS[pending.dungeonId];
  const maxSlots = getBuffSlotCount(hero, level);

  // drawnCardIds → ChallengeCard 해석
  const cardById = new Map(ALL_CARDS.map((c) => [c.id, c]));
  const drawnCards = pending.drawnCardIds
    .map((id) => cardById.get(id))
    .filter((c): c is ChallengeCard => c != null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        play("select");
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= maxSlots) {
        // 슬롯 가득 — 가장 오래된 선택 제거 후 추가
        play("select");
        return [...prev.slice(1), id];
      }
      play("select");
      return [...prev, id];
    });
  };

  const onConfirm = () => {
    play("confirm");
    confirmDungeon(selectedIds);
    setSelectedIds([]);
  };

  const onSkip = () => {
    // 버프 없이 진입
    play("confirm");
    confirmDungeon([]);
    setSelectedIds([]);
  };

  const onCancel = () => {
    play("cancel");
    cancelBuffDraw();
    setSelectedIds([]);
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ background: GB.darkest, color: GB.light }}
    >
      {/* === Header === */}
      <header
        className="px-4 py-3 shrink-0"
        style={{
          borderBottom: `1px solid ${GB.dark}`,
          background: `linear-gradient(180deg, ${dungeon.themeColor}18 0%, transparent 100%)`,
        }}
      >
        <div className="typo-caption" style={{ color: GB.light }}>
          {t("uphero.buff.entering", {
            dungeon: dungeonName(dungeon.id, dungeon.name, language),
          })}
        </div>
        <div
          className="typo-body mt-1 tabular-nums"
          style={{ color: GB.lightest }}
        >
          {t("uphero.buff.selectHeading", {
            selected: selectedIds.length,
            max: maxSlots,
          })}
        </div>
      </header>

      {/* === Drawn cards grid === */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {drawnCards.length === 0 ? (
          <div className={`typo-caption ${gbClass.textDim} text-center py-8`}>
            {t("uphero.buff.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {drawnCards.map((card) => (
              <BuffCardPreview
                key={card.id}
                card={card}
                selected={selectedIds.includes(card.id)}
                onToggle={() => toggleSelect(card.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* === Footer actions === */}
      <footer
        className="px-3 py-3 flex items-center gap-2 shrink-0"
        style={{
          borderTop: `1px solid ${GB.dark}`,
          paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="uphero-draw-btn typo-caption rounded"
          style={{
            minHeight: 40,
            padding: "8px 14px",
            background: "transparent",
            color: GB_ENEMY,
            border: `1px solid ${GB_ENEMY}`,
          }}
        >
          {t("uphero.buff.cancel")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="uphero-draw-btn typo-caption rounded"
          style={{
            minHeight: 40,
            padding: "8px 14px",
            background: `${GB.dark}cc`,
            color: GB.light,
            border: `1px solid ${GB.dark}`,
          }}
        >
          {t("uphero.buff.skip")}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onConfirm}
          disabled={selectedIds.length === 0}
          className="uphero-draw-btn typo-body rounded"
          style={{
            minHeight: 44,
            padding: "10px 16px",
            background: selectedIds.length > 0 ? GB.lightest : `${GB.dark}66`,
            color: selectedIds.length > 0 ? GB.darkest : GB.light,
            border: `1px solid ${selectedIds.length > 0 ? GB.lightest : GB.dark}`,
            opacity: selectedIds.length > 0 ? 1 : 0.6,
          }}
        >
          {selectedIds.length > 0
            ? t("uphero.buff.enterN", { count: selectedIds.length })
            : t("uphero.buff.enter")}
        </button>
        <style jsx>{`
          .uphero-draw-btn {
            transition: transform 120ms ${EASE_OUT};
          }
          .uphero-draw-btn:not(:disabled):active {
            transform: scale(0.97);
          }
        `}</style>
      </footer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

function BuffCardPreview({
  card,
  selected,
  onToggle,
}: {
  card: ChallengeCard;
  selected: boolean;
  onToggle: () => void;
}) {
  const { language } = useTranslation();
  const buff = useMemo(() => getCardBuff(card), [card]);
  // Phase 13 review P3 — describeCardBuff 가 effects 배열 × 여러 dictT 호출 수행.
  //   buff / language 가 바뀌지 않는 한 결과 동일 → 메모이즈.
  const buffDesc = useMemo(
    () => describeCardBuff(buff, language),
    [buff, language],
  );
  const displayTitle = useMemo(
    () => cardTitle(card, language),
    [card, language],
  );
  const rarityColor = RARITY_COLOR[card.rarity];

  // 선택 순간 pulse — selected 가 false → true 로 바뀐 edge 에서만 재생.
  // 애니메이션 restart 를 위해: 먼저 클래스를 제거, 다음 프레임에 추가 → reflow 를
  // 거치면서 keyframe 이 0부터 다시 시작된다 (remount 없이 DOM focus 보존).
  const prevSelectedRef = useRef(selected);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (selected && !prevSelectedRef.current) {
      setPulsing(false);
      const raf = requestAnimationFrame(() => setPulsing(true));
      const clear = window.setTimeout(() => setPulsing(false), 290);
      prevSelectedRef.current = selected;
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(clear);
      };
    }
    prevSelectedRef.current = selected;
  }, [selected]);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`uphero-buff-card text-left rounded-md relative overflow-hidden ${
        pulsing ? "uphero-card-select" : ""
      }`}
      style={{
        minHeight: 124,
        padding: "10px 10px 12px",
        background: selected ? `${rarityColor}30` : `${GB.dark}99`,
        border: `1px solid ${selected ? GB.lightest : rarityColor}`,
        color: GB.light,
        transition: `background 180ms ${EASE_OUT}, border-color 180ms ${EASE_OUT}`,
      }}
    >
      {/* 선택 체크 배지 */}
      {selected && (
        <div
          className="absolute top-1.5 right-1.5 typo-micro px-1.5 py-0.5 rounded tabular-nums"
          style={{
            background: GB.lightest,
            color: GB.darkest,
            letterSpacing: "0.05em",
          }}
        >
          ✓
        </div>
      )}

      {/* 아이콘 + rarity dot */}
      <div className="flex items-start justify-between mb-2">
        <PixelIcon
          name={card.icon}
          size={22}
          color={selected ? GB.lightest : rarityColor}
        />
        {card.rarity !== "normal" && !selected && (
          <div
            className="rounded-full shrink-0"
            style={{
              width: 6,
              height: 6,
              background: rarityColor,
              boxShadow: `0 0 4px ${rarityColor}`,
              marginTop: 2,
            }}
          />
        )}
      </div>

      {/* 이름 — Phase 13b: 카드 title 다국어 (cardTitle 헬퍼 사용) */}
      <div
        className="typo-caption leading-tight truncate"
        style={{ color: selected ? GB.lightest : rarityColor }}
      >
        {displayTitle}
      </div>

      {/* 버프 설명 */}
      <div
        className="typo-caption leading-tight mt-1"
        style={{ color: GB.light }}
      >
        {buffDesc}
      </div>

      <style jsx>{`
        .uphero-buff-card {
          transition: transform 120ms ${EASE_OUT};
        }
        .uphero-buff-card:active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}
