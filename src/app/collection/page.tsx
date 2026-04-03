"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { ALL_CARDS } from "@/data/cards";
import { RARITY_CONFIG } from "@/data/rarityConfig";
import { ALL_TITLES, getEarnedTitleIds, getTitleProgress, categoryLabel } from "@/data/titles";
import type { Category } from "@/types/card";
import type { TitleDefinition } from "@/types/title";
import PixelIcon from "@/components/icons/PixelIcon";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { t as translate, cardTitle, titleName, titleDesc } from "@/i18n";
import { rarityLabel } from "@/data/rarityConfig";
import type { Language } from "@/types/game";

type Tab = "cards" | "titles";
type Filter = "all" | "owned" | "unowned";

const CATEGORY_ORDER: Category[] = [
  "fitness", "nutrition", "mindfulness", "learning", "social", "productivity", "wellness",
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

  const earnedIds = isLoaded ? getEarnedTitleIds(progress) : [];
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

  return (
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { play("select"); setTab("cards"); setFilter("all"); }}
          className={`flex-1 py-2.5 rounded-md typo-body transition-all ${
            tab === "cards" ? "bg-accent text-bg-primary" : "bg-bg-surface text-text-secondary"
          }`}
        >
          {t("collection.tab.cards")} ({unlockedCount}/{totalCount})
        </button>
        <button
          onClick={() => { play("select"); setTab("titles"); setFilter("all"); }}
          className={`flex-1 py-2.5 rounded-md typo-body transition-all relative ${
            tab === "titles" ? "bg-accent text-bg-primary" : "bg-bg-surface text-text-secondary"
          }`}
        >
          {t("collection.tab.titles")} ({earnedTitleCount}/{ALL_TITLES.length})
          {newTitleCount > 0 && tab !== "titles" && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-secondary rounded-full typo-micro text-bg-primary flex items-center justify-center">
              {newTitleCount}
            </span>
          )}
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-1.5 mb-5">
        {([["all", t("collection.filter.all")], ["owned", t("collection.filter.owned")], ["unowned", t("collection.filter.unowned")]] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { play("select"); setFilter(key); }}
            className={`px-3 py-1.5 rounded-md typo-caption transition-all ${
              filter === key
                ? "bg-text-primary text-bg-primary"
                : "bg-bg-surface text-text-tertiary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cards" ? (
        <CardsTab progress={progress} filter={filter} language={language} />
      ) : (
        <TitlesTab progress={progress} earnedIds={earnedIds} equipTitle={equipTitle} filter={filter} play={play} language={language} />
      )}
    </div>
  );
}

/* ── 아코디언 섹션 ── */
function AccordionSection({
  label,
  count,
  total,
  defaultOpen = true,
  children,
}: {
  label: string;
  count: number;
  total: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2 mb-2"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <PixelIcon name="ChevronDown" size={16} className="text-text-tertiary" />
          </motion.div>
          <h3 className="typo-caption text-text-primary">{label}</h3>
        </div>
        <span className="typo-caption">{count}/{total}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const cardsByCategory = CATEGORY_ORDER.map((cat) => {
    const allCards = ALL_CARDS.filter((c) => c.category === cat);
    const filtered = allCards.filter((c) => {
      const isUnlocked = progress.unlockedCardIds.includes(c.id);
      if (filter === "owned") return isUnlocked;
      if (filter === "unowned") return !isUnlocked;
      return true;
    });
    const unlockedInCat = allCards.filter((c) => progress.unlockedCardIds.includes(c.id)).length;
    const label = categoryLabel(cat, language);
    return { category: cat, label, cards: filtered, unlockedInCat, totalInCat: allCards.length };
  }).filter((g) => g.cards.length > 0);

  if (cardsByCategory.length === 0) {
    return <p className="text-center text-text-tertiary py-12 typo-body">{translate("collection.cards.empty", language)}</p>;
  }

  return (
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
              const isUnlocked = progress.unlockedCardIds.includes(card.id);
              const rarity = RARITY_CONFIG[card.rarity];
              return (
                <motion.div
                  key={card.id}
                  variants={fadeInUp}
                  className={`relative rounded-lg p-3 transition-all grid-border ${
                    isUnlocked ? rarity.bgClass : "bg-bg-elevated"
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
  ].map((g) => {
    const earnedInGroup = g.titles.filter((t) => earnedIds.includes(t.id)).length;
    return { ...g, filtered: g.titles.filter(filterTitle), earnedInGroup, totalInGroup: g.titles.length };
  }).filter((g) => g.filtered.length > 0);

  if (groups.length === 0) {
    return <p className="text-center text-text-tertiary py-12 typo-body">{translate("collection.titles.empty", language)}</p>;
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
