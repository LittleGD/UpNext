"use client";

import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { ALL_CARDS } from "@/data/cards";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { ALL_TITLES, getEarnedTitleIds, getTitleProgress, categoryLabel } from "@/data/titles";
import type { Category } from "@/types/card";
import type { TitleDefinition } from "@/types/title";
import PixelIcon from "@/components/icons/PixelIcon";
import AccordionSection from "@/components/ui/AccordionSection";
import ArchiveSheet from "@/components/growth/ArchiveSheet";
import { AnimatePresence, motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { t as translate, cardTitle, titleName, titleDesc } from "@/i18n";
import { rarityLabel } from "@/data/rarityConfig";
import type { ChallengeCard } from "@/types/card";
import type { Language } from "@/types/game";
import CardDetailModal from "@/components/cards/CardDetailModal";

// Phase 8c — 앨범(archive) 을 playground 에서 Collection 으로 이동.
//   카드/칭호/앨범 모두 "수집된 것" 카테고리라 Collection 이 의미상 더 정확.
//   탭 룩은 EquipmentInventory (아지트) 의 sliding underline 패턴과 통일.
type Tab = "cards" | "titles" | "album";
type Filter = "all" | "owned" | "unowned";

const CATEGORY_ORDER: Category[] = [
  "fitness", "nutrition", "mindfulness", "learning", "social", "productivity", "wellness", "trending",
];

export default function CollectionPage() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const progress = useGameStore((s) => s.progress);
  const equipTitle = useGameStore((s) => s.equipTitle);
  const markTitlesSeen = useGameStore((s) => s.markTitlesSeen);
  const { play } = useSound();
  const { t, language } = useTranslation();

  const [tab, setTab] = useState<Tab>("cards");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  const earnedIds = useMemo(
    () => isLoaded ? getEarnedTitleIds(progress) : [],
    [isLoaded, progress]
  );
  useEffect(() => {
    if (tab === "titles" && earnedIds.length > 0) {
      markTitlesSeen(earnedIds);
    }
  }, [tab, earnedIds.length, markTitlesSeen]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="skeleton w-32 h-4" />
      </div>
    );
  }

  const unlockedCount = progress.unlockedCardIds.length;
  const totalCount = ALL_CARDS.length;
  const earnedTitleCount = earnedIds.length;
  const seenIds = progress.seenTitleIds || [];
  const newTitleCount = earnedIds.filter((id) => !seenIds.includes(id)).length;

  // Phase 8c — 앨범 탭 배지: photoMetas 개수.
  // Phase 9d-ⅰ — Header 가 compact 로 얇아짐 → Collection/Playground 상단도 pt-2 로.
  return (
    <div className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
      {/* Phase 8c — 탭 (아지트 스타일).
            각 버튼 flex-1 로 균일, 부모에 sliding underline indicator.
            탭 간 전환 시 밑줄이 하나의 객체로 옮겨가는 지각 (gestalt common fate). */}
      <CollectionTabs
        tab={tab}
        onChange={(t) => {
          play("select");
          setTab(t);
          setFilter("all");
        }}
        unlockedCount={unlockedCount}
        totalCount={totalCount}
        earnedTitleCount={earnedTitleCount}
        totalTitles={ALL_TITLES.length}
        newTitleCount={newTitleCount}
        cardsLabel={t("collection.tab.cards")}
        titlesLabel={t("collection.tab.titles")}
        albumLabel={t("collection.tab.album")}
      />

      {/* 필터 — 앨범 탭에선 불필요 (사진은 시간순만) */}
      {tab !== "album" && (
        <div className="flex gap-1.5 mb-5 mt-4">
          {([["all", t("collection.filter.all")], ["owned", t("collection.filter.owned")], ["unowned", t("collection.filter.unowned")]] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { play("select"); setFilter(key); }}
              className={`collection-filter-btn px-3 py-1.5 rounded-md typo-caption ${
                filter === key
                  ? "bg-text-primary text-bg-primary"
                  : "bg-bg-surface text-text-tertiary"
              }`}
            >
              {label}
              <style jsx>{`
                .collection-filter-btn {
                  transition: background 160ms cubic-bezier(0.23, 1, 0.32, 1),
                    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
                    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
                }
                .collection-filter-btn:active {
                  transform: scale(0.96);
                }
              `}</style>
            </button>
          ))}
        </div>
      )}

      {/* 탭 컨텐츠 — key={tab} 로 remount 하여 fade+slide enter keyframe 재생.
          EquipmentInventory 의 .eq-tab-content 와 동일 감각 (200ms fade + 4px up). */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      >
        {tab === "cards" && (
          <CardsTab progress={progress} filter={filter} language={language} />
        )}
        {tab === "titles" && (
          <TitlesTab progress={progress} earnedIds={earnedIds} equipTitle={equipTitle} filter={filter} play={play} language={language} />
        )}
        {tab === "album" && <ArchiveSheet />}
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */

/**
 * Phase 8c — Collection 탭 바 (EquipmentInventory 의 탭 패턴과 동일 룩).
 *
 * 설계:
 *  - 3개 버튼 flex-1 로 균일 너비
 *  - 부모 relative 에 sliding underline indicator (2px) — translateX 로 이동
 *  - 활성 탭: accent color + underline 이 해당 위치로 slide (240ms easeOut)
 *  - 버튼 press: scale(0.97) 120ms (고빈도 인터랙션, 즉각 반응)
 *  - 카운트는 label 옆 (숫자/숫자) 형식 — 로그라이크 감성 (tabular-nums)
 *  - 칭호 탭에만 newTitleCount 뱃지 (우상단 pulse 도트)
 */
function CollectionTabs({
  tab,
  onChange,
  unlockedCount,
  totalCount,
  earnedTitleCount,
  totalTitles,
  newTitleCount,
  cardsLabel,
  titlesLabel,
  albumLabel,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  unlockedCount: number;
  totalCount: number;
  earnedTitleCount: number;
  totalTitles: number;
  newTitleCount: number;
  cardsLabel: string;
  titlesLabel: string;
  albumLabel: string;
}) {
  const tabIndex = tab === "cards" ? 0 : tab === "titles" ? 1 : 2;

  return (
    <nav
      className="relative flex items-stretch"
      style={{ borderBottom: "1px solid rgb(255 255 255 / 0.06)" }}
    >
      <CollectionTabButton
        active={tab === "cards"}
        onClick={() => onChange("cards")}
        label={cardsLabel}
        count={unlockedCount}
        total={totalCount}
      />
      <CollectionTabButton
        active={tab === "titles"}
        onClick={() => onChange("titles")}
        label={titlesLabel}
        count={earnedTitleCount}
        total={totalTitles}
        newBadge={newTitleCount > 0 && tab !== "titles" ? newTitleCount : 0}
      />
      <CollectionTabButton
        active={tab === "album"}
        onClick={() => onChange("album")}
        label={albumLabel}
      />
      {/* Sliding underline — 3 탭 균등 width 33.333%. Emil: one object moving. */}
      <div
        aria-hidden="true"
        className="absolute bottom-[-1px] h-[2px]"
        style={{
          width: "33.3333%",
          left: 0,
          background: "var(--accent-primary)",
          transform: `translateX(${tabIndex * 100}%)`,
          transition: "transform 240ms cubic-bezier(0.23, 1, 0.32, 1)",
          boxShadow: "0 0 4px color-mix(in srgb, var(--accent-primary) 40%, transparent)",
        }}
      />
    </nav>
  );
}

function CollectionTabButton({
  active,
  onClick,
  label,
  count,
  total,
  newBadge = 0,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  total?: number;
  newBadge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="collection-tab-btn relative flex-1 py-2.5 typo-body"
      style={{
        color: active ? "var(--accent-primary)" : "var(--text-secondary)",
        background: "transparent",
      }}
      aria-current={active ? "page" : undefined}
    >
      <span className="inline-flex items-center gap-1.5 justify-center">
        <span>{label}</span>
        {count != null && total != null && (
          <span
            className="typo-caption tabular-nums"
            style={{
              color: active
                ? "color-mix(in srgb, var(--accent-primary) 75%, transparent)"
                : "var(--text-tertiary)",
            }}
          >
            {count}/{total}
          </span>
        )}
      </span>
      {newBadge > 0 && (
        <span
          className="absolute top-1 right-2 rounded-full typo-micro flex items-center justify-center"
          style={{
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            background: "var(--accent-secondary)",
            color: "var(--bg-primary)",
          }}
        >
          {newBadge}
        </span>
      )}
      <style jsx>{`
        .collection-tab-btn {
          transition: color 180ms cubic-bezier(0.23, 1, 0.32, 1),
            transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .collection-tab-btn:active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}

/* ── 카드 탭 ── */
function CardsTab({
  progress,
  filter,
  language,
}: {
  progress: ReturnType<typeof useGameStore.getState>["progress"];
  filter: Filter;
  language: Language;
}) {
  const [selectedCard, setSelectedCard] = useState<ChallengeCard | null>(null);
  const unlockedSet = useMemo(() => new Set(progress.unlockedCardIds), [progress.unlockedCardIds]);

  const cardsByCategory = CATEGORY_ORDER.map((cat) => {
    const allCards = ALL_CARDS.filter((c) => c.category === cat);
    const filtered = allCards.filter((c) => {
      const isUnlocked = unlockedSet.has(c.id);
      if (filter === "owned") return isUnlocked;
      if (filter === "unowned") return !isUnlocked;
      return true;
    });
    const unlockedInCat = allCards.filter((c) => unlockedSet.has(c.id)).length;
    const label = categoryLabel(cat, language);
    return { category: cat, label, cards: filtered, unlockedInCat, totalInCat: allCards.length };
  }).filter((g) => g.cards.length > 0);

  if (cardsByCategory.length === 0) {
    // Phase 12 R10 — 빈 상태 UX 보강. 기존 단문 → 아이콘 + 맥락 hint + 필터
    //   전환 CTA. "왜 비었는지" / "어떻게 채울지" 를 즉시 전달.
    const isFiltered = filter !== "all";
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: "var(--bg-elevated)" }}
        >
          <PixelIcon
            name={isFiltered ? "Search" : "Archive"}
            size={28}
            color="var(--text-tertiary)"
          />
        </div>
        <p className="typo-body text-text-secondary mb-1">
          {translate("collection.cards.empty", language)}
        </p>
        <p className="typo-caption text-text-tertiary max-w-[280px]">
          {isFiltered
            ? "다른 필터로 확인하거나 새 카드를 모아보세요."
            : "챌린지를 완료하고 카드팩을 열어 수집해보세요."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {cardsByCategory.map(({ category, label, cards, unlockedInCat, totalInCat }) => (
          <AccordionSection key={category} label={label} count={unlockedInCat} total={totalInCat}>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-2"
            >
              {cards.map((card) => {
                const isUnlocked = unlockedSet.has(card.id);
                const rarity = RARITY_CONFIG[card.rarity];
                return (
                  <motion.div
                    key={card.id}
                    variants={fadeInUp}
                    onClick={isUnlocked ? () => setSelectedCard(card) : undefined}
                    className={`relative rounded-lg p-3 transition-all grid-border ${
                      isUnlocked ? `${rarity.bgClass} cursor-pointer` : "bg-bg-elevated"
                    }`}
                  >
                    {!isUnlocked && (
                      <div className="absolute inset-0 z-10 rounded-lg flex items-center justify-center">
                        <PixelIcon name="Lock" size={32} className="text-text-tertiary" />
                      </div>
                    )}
                    <div className={!isUnlocked ? "blur-sm pointer-events-none" : ""}>
                      <div
                        className="absolute top-2 right-2 typo-micro px-1.5 py-0.5 rounded-sm text-black"
                        style={{ backgroundColor: rarity.color }}
                      >
                        {rarityLabel(card.rarity, language)}
                      </div>
                      <div className="mb-2" style={{ color: rarity.color }}>
                        <PixelIcon name={card.icon} size={28} />
                      </div>
                      <p className="typo-caption text-text-primary leading-tight">
                        {cardTitle(card, language)}
                      </p>
                      <p className="typo-caption text-text-tertiary mt-1">
                        {categoryLabel(card.category, language)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </AccordionSection>
        ))}
      </div>

      {/* 카드 디테일 모달 */}
      <AnimatePresence>
        {selectedCard && (
          <CardDetailModal
            key={selectedCard.id}
            card={selectedCard}
            language={language}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ── 칭호 탭 ── */
function TitlesTab({
  progress,
  earnedIds,
  equipTitle,
  filter,
  play,
  language,
}: {
  progress: ReturnType<typeof useGameStore.getState>["progress"];
  earnedIds: string[];
  equipTitle: (id: string | null) => void;
  filter: Filter;
  play: (name: import("@/lib/sounds").SoundName) => void;
  language: Language;
}) {
  const filterTitle = (t: TitleDefinition) => {
    const isEarned = earnedIds.includes(t.id);
    if (filter === "owned") return isEarned;
    if (filter === "unowned") return !isEarned;
    return true;
  };

  const groups = [
    ...CATEGORY_ORDER.map((cat) => ({
      key: `cat-${cat}`,
      label: translate("collection.titles.categoryTitles", language, { category: categoryLabel(cat, language) }),
      titles: ALL_TITLES.filter(
        (t) => t.condition.type === "category" && t.condition.category === cat
      ),
    })),
    {
      key: "special",
      label: translate("collection.titles.special", language),
      titles: ALL_TITLES.filter((t) => t.condition.type === "card"),
    },
    {
      key: "streak",
      label: translate("collection.titles.streak", language),
      titles: ALL_TITLES.filter((t) => t.condition.type === "streak"),
    },
    {
      key: "extra",
      label: translate("collection.titles.extra", language),
      titles: ALL_TITLES.filter((t) => t.condition.type === "extra"),
    },
  ].map((g) => {
    const earnedInGroup = g.titles.filter((t) => earnedIds.includes(t.id)).length;
    return { ...g, filtered: g.titles.filter(filterTitle), earnedInGroup, totalInGroup: g.titles.length };
  }).filter((g) => g.filtered.length > 0);

  if (groups.length === 0) {
    // Phase 12 R10 — 빈 상태 보강 (카드 empty 와 동일 패턴).
    const isFiltered = filter !== "all";
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: "var(--bg-elevated)" }}
        >
          <PixelIcon
            name={isFiltered ? "Search" : "Trophy"}
            size={28}
            color="var(--text-tertiary)"
          />
        </div>
        <p className="typo-body text-text-secondary mb-1">
          {translate("collection.titles.empty", language)}
        </p>
        <p className="typo-caption text-text-tertiary max-w-[280px]">
          {isFiltered
            ? "다른 필터로 확인해보세요."
            : "챌린지를 반복하면 칭호를 획득할 수 있어요."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 장착 중인 칭호 */}
      {progress.equippedTitleId && (
        <div className="bg-bg-surface rounded-lg p-4 grid-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="typo-caption mb-1">{translate("collection.titles.equipped", language)}</p>
              <p className="typo-body text-accent">
                {(() => { const tt = ALL_TITLES.find((t) => t.id === progress.equippedTitleId); return tt ? titleName(tt, language) : ""; })()}
              </p>
            </div>
            <button
              onClick={() => { play("select"); equipTitle(null); }}
              className="typo-body text-text-tertiary px-3 py-1.5 rounded-md bg-bg-elevated"
            >
              {translate("common.unequip", language)}
            </button>
          </div>
        </div>
      )}

      {groups.map(({ key, label, filtered, earnedInGroup, totalInGroup }) => (
        <AccordionSection key={key} label={label} count={earnedInGroup} total={totalInGroup}>
          <div className="space-y-2 pb-2">
            {filtered.map((title) => (
              <TitleCard
                key={title.id}
                title={title}
                progress={progress}
                isEarned={earnedIds.includes(title.id)}
                isEquipped={progress.equippedTitleId === title.id}
                onEquip={() => { play("equip"); equipTitle(title.id); }}
                language={language}
              />
            ))}
          </div>
        </AccordionSection>
      ))}
    </div>
  );
}

/* ── 칭호 카드 ── */
function TitleCard({
  title,
  progress,
  isEarned,
  isEquipped,
  onEquip,
  language,
}: {
  title: TitleDefinition;
  progress: ReturnType<typeof useGameStore.getState>["progress"];
  isEarned: boolean;
  isEquipped: boolean;
  onEquip: () => void;
  language: Language;
}) {
  const rarity = RARITY_CONFIG[title.rarity];
  const { current, target } = getTitleProgress(title, progress);
  const percent = Math.min((current / target) * 100, 100);

  return (
    <motion.button
      whileTap={isEarned ? { scale: 0.98 } : undefined}
      onClick={isEarned ? onEquip : undefined}
      disabled={!isEarned}
      className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-all ${
        isEquipped
          ? "bg-bg-elevated grid-border-accent"
          : isEarned
          ? "bg-bg-surface grid-border"
          : "bg-bg-elevated opacity-60"
      }`}
    >
      <div className="flex items-center justify-center w-10 h-10 flex-shrink-0">
        <PixelIcon name={title.icon} size={24} color={isEarned ? rarity.color : "var(--text-tertiary)"} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="typo-micro px-1.5 py-0.5 rounded-sm"
            style={{
              backgroundColor: isEarned ? rarity.color : "var(--bg-surface)",
              color: isEarned ? "#0A0A0A" : "var(--text-tertiary)",
            }}
          >
            {rarityLabel(title.rarity, language)}
          </span>
          <span className={`typo-body truncate ${isEarned ? "text-text-primary" : "text-text-tertiary"}`}>
            {titleName(title, language)}
          </span>
          {isEquipped && (
            <span className="typo-micro text-accent px-1.5 py-0.5 bg-bg-surface rounded-sm flex-shrink-0">
              {translate("common.equipped", language)}
            </span>
          )}
        </div>
        <p className="typo-caption text-text-secondary mt-0.5">{titleDesc(title, language)}</p>
        {!isEarned && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1 bg-bg-elevated rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all"
                style={{ width: `${percent}%`, backgroundColor: rarity.color }}
              />
            </div>
            <span className="typo-micro text-text-tertiary flex-shrink-0">
              {current}/{target}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  );
}
