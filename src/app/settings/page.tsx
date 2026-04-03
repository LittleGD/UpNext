"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import type { GameMode } from "@/types/game";
import { getTitleForLevel, getXPProgress } from "@/types/game";
import { ALL_TITLES, getEarnedTitleIds } from "@/data/titles";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import PixelIcon from "@/components/icons/PixelIcon";
import AuthSection from "@/components/auth/AuthSection";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useAuthStore } from "@/store/useAuthStore";
import { deleteCloudData } from "@/lib/sync";
import { motion, AnimatePresence } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import { titleName } from "@/i18n";

const modes: { key: GameMode; labelKey: DictKey; descKey: DictKey; cards: number }[] = [
  { key: "normal", labelKey: "settings.mode.normal", descKey: "settings.mode.normal.desc", cards: 1 },
  { key: "godlife", labelKey: "settings.mode.godlife", descKey: "settings.mode.godlife.desc", cards: 2 },
  { key: "ultra", labelKey: "settings.mode.ultra", descKey: "settings.mode.ultra.desc", cards: 3 },
];

export default function SettingsPage() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const progress = useGameStore((s) => s.progress);
  const setMode = useGameStore((s) => s.setMode);
  const cancelPendingMode = useGameStore((s) => s.cancelPendingMode);
  const toggleSound = useGameStore((s) => s.toggleSound);
  const equipTitle = useGameStore((s) => s.equipTitle);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="skeleton w-32 h-4" />
      </div>
    );
  }

  const handleModeConfirm = () => {
    if (pendingMode) {
      play("confirm");
      setMode(pendingMode);
      setPendingMode(null);
    }
  };

  const earnedIds = getEarnedTitleIds(progress);
  const earnedTitles = ALL_TITLES.filter((title) => earnedIds.includes(title.id));
  const defaultTitle = getTitleForLevel(progress.level, language);

  return (
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto space-y-5">
      <h2 className="typo-title text-text-primary">{t("settings.title")}</h2>

      {/* ── 일반 설정 (언어 + 사운드) ── */}
      <section className="rounded-lg bg-bg-surface grid-border overflow-hidden">
        {/* 언어 */}
        <LanguageToggle />
        {/* 구분선 */}
        <div className="h-px bg-white/[0.06]" />
        {/* 사운드 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <PixelIcon name="Sparkle" size={20} color="var(--text-secondary)" />
            <span className="typo-body text-text-primary">{t("settings.sound.effects")}</span>
          </div>
          <button
            onClick={() => { toggleSound(); if (!progress.soundEnabled) play("select"); }}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              progress.soundEnabled ? "bg-accent" : "bg-bg-elevated"
            }`}
          >
            <motion.div
              animate={{ x: progress.soundEnabled ? 20 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white"
            />
          </button>
        </div>
      </section>

      {/* ── 챌린지 모드 ── */}
      <section className="space-y-2">
        <h3 className="typo-heading uppercase tracking-wider px-1">{t("settings.mode.heading")}</h3>
        <div className="rounded-lg bg-bg-surface grid-border overflow-hidden">
          {modes.map((mode, i) => {
            const isActive = progress.mode === mode.key;
            const isPending = progress.pendingMode === mode.key;
            return (
              <motion.button
                key={mode.key}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (isPending) {
                    play("cancel");
                    cancelPendingMode();
                  } else if (!isActive) {
                    play("select");
                    setPendingMode(mode.key);
                  }
                }}
                className={`
                  w-full text-left px-4 py-3.5 transition-colors relative
                  ${isActive
                    ? "bg-accent/10"
                    : isPending
                    ? "bg-accent/5"
                    : "hover:bg-bg-elevated"
                  }
                `}
              >
                {/* 활성 표시 바 */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isActive ? "border-accent" : isPending ? "border-accent/50" : "border-text-tertiary"
                    }`}>
                      {isActive && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
                      {isPending && <div className="w-2.5 h-2.5 rounded-full bg-accent/50" />}
                    </div>
                    <div>
                      <p className={`typo-body ${isActive ? "text-accent" : "text-text-primary"}`}>
                        {t(mode.labelKey)}
                      </p>
                      <p className="typo-caption text-text-tertiary mt-0.5">
                        {t(mode.descKey)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPending && (
                      <span className="typo-micro text-accent px-1.5 py-0.5 bg-accent/10 rounded-sm">
                        {t("settings.mode.pendingBadge")}
                      </span>
                    )}
                    <span className="typo-caption text-text-tertiary tabular-nums">
                      {mode.cards}{t("common.cardsPerDay")}
                    </span>
                  </div>
                </div>
                {/* 카드 간 구분선 (마지막 제외) */}
                {i < modes.length - 1 && (
                  <div className="absolute bottom-0 left-4 right-4 h-px bg-white/[0.06]" />
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ── 칭호 ── */}
      <section className="space-y-2">
        <h3 className="typo-heading uppercase tracking-wider px-1">{t("settings.titles.heading")}</h3>
        <div className="rounded-lg bg-bg-surface grid-border overflow-hidden">
          {/* 기본 칭호 */}
          <button
            onClick={() => { play("select"); equipTitle(null); }}
            className={`w-full text-left px-4 py-3.5 transition-colors relative ${
              !progress.equippedTitleId ? "bg-accent/10" : "hover:bg-bg-elevated"
            }`}
          >
            {!progress.equippedTitleId && (
              <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PixelIcon name="Zap" size={18} color={!progress.equippedTitleId ? "var(--accent-primary)" : "var(--text-tertiary)"} />
                <span className={`typo-body ${!progress.equippedTitleId ? "text-accent" : "text-text-primary"}`}>
                  {defaultTitle}
                </span>
              </div>
              <span className="typo-micro text-text-tertiary">
                {t("common.default")}
              </span>
            </div>
            <div className="absolute bottom-0 left-4 right-4 h-px bg-white/[0.06]" />
          </button>

          {/* 획득한 칭호들 */}
          {earnedTitles.map((title, i) => {
            const isEquipped = progress.equippedTitleId === title.id;
            const rarity = RARITY_CONFIG[title.rarity];
            return (
              <button
                key={title.id}
                onClick={() => { play("equip"); equipTitle(title.id); }}
                className={`w-full text-left px-4 py-3.5 transition-colors relative ${
                  isEquipped ? "bg-accent/10" : "hover:bg-bg-elevated"
                }`}
              >
                {isEquipped && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <PixelIcon name={title.icon} size={18} color={isEquipped ? "var(--accent-primary)" : rarity.color} />
                    <span className={`typo-body ${isEquipped ? "text-accent" : "text-text-primary"}`}>
                      {titleName(title, language)}
                    </span>
                  </div>
                  <span
                    className="typo-micro px-1.5 py-0.5 rounded-sm"
                    style={{
                      backgroundColor: isEquipped ? "rgba(205, 245, 100, 0.1)" : `${rarity.color}20`,
                      color: isEquipped ? "var(--accent-primary)" : rarity.color,
                    }}
                  >
                    {rarityLabel(title.rarity, language)}
                  </span>
                </div>
                {i < earnedTitles.length - 1 && (
                  <div className="absolute bottom-0 left-4 right-4 h-px bg-white/[0.06]" />
                )}
              </button>
            );
          })}

          {earnedTitles.length === 0 && (
            <p className="typo-caption text-text-tertiary px-4 py-3">
              {t("settings.titles.empty")}
            </p>
          )}
        </div>
      </section>

      {/* ── 계정 연동 ── */}
      <AuthSection />

      {/* ── 내 기록 ── */}
      <section className="space-y-2">
        <h3 className="typo-heading uppercase tracking-wider px-1">{t("settings.stats.heading")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label={t("settings.stats.currentStreak")} value={`${progress.currentStreak}${t("settings.stats.days")}`} icon="Zap" color="var(--accent-primary)" />
          <StatCard label={t("settings.stats.longestStreak")} value={`${progress.longestStreak}${t("settings.stats.days")}`} icon="Trophy" color="var(--rarity-legend)" />
          <StatCard label={t("settings.stats.totalXP")} value={`${progress.xp || 0} XP`} icon="Sparkle" color="var(--accent-cyan)" />
          <StatCard
            label={t("settings.stats.unlockedCards")}
            value={`${progress.unlockedCardIds.length}${t("settings.stats.cards")}`}
            icon="Card"
            color="var(--rarity-unique)"
          />
        </div>
      </section>

      {/* ── 위험 영역 ── */}
      <section className="pt-2">
        <div className="h-px bg-white/[0.04] mb-4" />
        <button
          onClick={async () => {
            play("select");
            const authUser = useAuthStore.getState().user;
            const msg = authUser
              ? t("settings.reset.confirmWithAccount")
              : t("settings.reset.confirmLocal");
            if (window.confirm(msg)) {
              if (authUser) {
                try {
                  await deleteCloudData(authUser.uid);
                  await useAuthStore.getState().signOut();
                } catch (e) {
                  console.error("Cloud data deletion failed:", e);
                }
              }
              localStorage.clear();
              window.location.href = "/";
            }
          }}
          className="typo-caption text-text-tertiary hover:text-accent-secondary transition-colors"
        >
          {t("settings.reset.button")}
        </button>
      </section>

      {/* ── 모드 변경 확인 모달 ── */}
      <AnimatePresence>
        {pendingMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setPendingMode(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={springSnappy}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-bg-elevated rounded-2xl p-6 space-y-4"
            >
              <p className="typo-body text-text-primary text-center">
                <span className="font-semibold">
                  {modes.find((m) => m.key === pendingMode) && t(modes.find((m) => m.key === pendingMode)!.labelKey)}
                </span>
                {" "}{t("settings.mode.confirmPrompt")}
              </p>
              <p className="typo-body text-text-secondary text-center">
                {t("settings.mode.confirmDesc", { cards: modes.find((m) => m.key === pendingMode)?.cards ?? 0 })}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => { play("select"); setPendingMode(null); }}
                  className="px-6 py-3 rounded-md bg-bg-surface text-text-secondary typo-body"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleModeConfirm}
                  className="px-6 py-3 rounded-md bg-accent text-bg-primary typo-body"
                >
                  {t("common.change")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-bg-surface rounded-lg p-3.5 grid-border">
      <PixelIcon name={icon} size={20} color={color} />
      <p className="typo-heading text-text-primary mt-1.5 tabular-nums">{value}</p>
      <p className="typo-caption text-text-tertiary">{label}</p>
    </div>
  );
}
