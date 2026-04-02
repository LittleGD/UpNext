"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import type { GameMode } from "@/types/game";
import { getTitleForLevel, getXPProgress } from "@/types/game";
import { ALL_TITLES, getEarnedTitleIds } from "@/data/titles";
import { RARITY_CONFIG } from "@/data/rarityConfig";
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

  return (
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto space-y-6">
      <h2 className="text-heading-1 text-text-primary">{t("settings.title")}</h2>

      {/* 언어 설정 */}
      <div className="space-y-3">
        <h3 className="text-body font-semibold text-text-secondary">{t("language.toggle")}</h3>
        <div className="bg-bg-surface rounded-lg p-4 grid-border">
          <LanguageToggle />
        </div>
      </div>

      {/* 사운드 토글 */}
      <div className="space-y-3">
        <h3 className="text-body font-semibold text-text-secondary">{t("settings.sound.heading")}</h3>
        <div className="flex items-center justify-between p-4 rounded-lg bg-bg-surface">
          <div className="flex items-center gap-3">
            <PixelIcon name="Sparkle" size={20} color="var(--text-secondary)" />
            <span className="text-sm font-semibold text-text-primary">{t("settings.sound.effects")}</span>
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
      </div>

      {/* 모드 선택 */}
      <div className="space-y-3">
        <h3 className="text-body font-semibold text-text-secondary">{t("settings.mode.heading")}</h3>
        {modes.map((mode) => {
          const isActive = progress.mode === mode.key;
          const isPending = progress.pendingMode === mode.key;
          return (
            <motion.button
              key={mode.key}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (!isActive && !isPending) setPendingMode(mode.key);
              }}
              className={`
                w-full text-left p-4 rounded-lg transition-all
                ${isActive
                  ? "bg-accent text-bg-primary"
                  : "bg-bg-surface text-text-primary hover:bg-bg-elevated"
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-semibold ${isActive ? "text-bg-primary" : "text-text-primary"}`}>
                    {t(mode.labelKey)}
                  </p>
                  <p className={`text-sm mt-0.5 ${isActive ? "text-bg-primary/70" : "text-text-secondary"}`}>
                    {t(mode.descKey)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isPending && (
                    <span className="text-[10px] font-bold text-accent px-1.5 py-0.5 bg-accent/20 rounded-sm">
                      {t("settings.mode.pendingBadge")}
                    </span>
                  )}
                  <span
                    className={`text-sm font-bold px-2 py-1 rounded-sm ${
                      isActive ? "bg-black/20 text-bg-primary" : "bg-bg-elevated text-text-tertiary"
                    }`}
                  >
                    {mode.cards}{t("common.cardsPerDay")}
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 칭호 설정 */}
      <div className="space-y-3">
        <h3 className="text-body font-semibold text-text-secondary">{t("settings.titles.heading")}</h3>
        {(() => {
          const earnedIds = getEarnedTitleIds(progress);
          const earnedTitles = ALL_TITLES.filter((t) => earnedIds.includes(t.id));
          const equippedTitle = progress.equippedTitleId
            ? ALL_TITLES.find((t) => t.id === progress.equippedTitleId)
            : null;
          const defaultTitle = getTitleForLevel(progress.level, language);

          return (
            <div className="space-y-2">
              {/* 기본 칭호 (레벨 기반) */}
              <button
                onClick={() => { play("select"); equipTitle(null); }}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  !progress.equippedTitleId
                    ? "bg-accent text-bg-primary"
                    : "bg-bg-surface text-text-primary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PixelIcon name="Zap" size={18} />
                    <span className="text-sm font-semibold">{defaultTitle}</span>
                  </div>
                  <span className={`text-[11px] ${!progress.equippedTitleId ? "text-bg-primary/70" : "text-text-tertiary"}`}>
                    {t("common.default")}
                  </span>
                </div>
              </button>

              {/* 획득한 칭호들 */}
              {earnedTitles.map((title) => {
                const isEquipped = progress.equippedTitleId === title.id;
                const rarity = RARITY_CONFIG[title.rarity];
                return (
                  <button
                    key={title.id}
                    onClick={() => { play("equip"); equipTitle(title.id); }}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      isEquipped
                        ? "bg-accent text-bg-primary"
                        : "bg-bg-surface text-text-primary"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PixelIcon name={title.icon} size={18} color={isEquipped ? undefined : rarity.color} />
                        <span className="text-sm font-semibold">{language === "en" && title.nameEn ? title.nameEn : title.name}</span>
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm"
                        style={{
                          backgroundColor: isEquipped ? "rgba(0,0,0,0.2)" : rarity.color,
                          color: isEquipped ? "var(--bg-primary)" : "#0A0A0A",
                        }}
                      >
                        {language === "en" ? rarity.label : rarity.labelKo}
                      </span>
                    </div>
                  </button>
                );
              })}

              {earnedTitles.length === 0 && (
                <p className="text-sm text-text-tertiary py-2">
                  {t("settings.titles.empty")}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* 계정 연동 */}
      <AuthSection />

      {/* 통계 */}
      <div className="space-y-3">
        <h3 className="text-body font-semibold text-text-secondary">{t("settings.stats.heading")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      </div>

      {/* 데이터 리셋 */}
      <div className="pt-4">
        <button
          onClick={async () => {
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
          className="text-sm text-accent-secondary hover:text-accent-secondary/80"
        >
          {t("settings.reset.button")}
        </button>
      </div>

      {/* 모드 변경 확인 모달 */}
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
              className="w-full max-w-md bg-bg-elevated rounded-lg p-6 space-y-4"
            >
              <p className="text-body text-text-primary text-center">
                <span className="font-semibold">
                  {modes.find((m) => m.key === pendingMode) && t(modes.find((m) => m.key === pendingMode)!.labelKey)}
                </span>
                {" "}{t("settings.mode.confirmPrompt")}
              </p>
              <p className="text-sm text-text-secondary text-center">
                {t("settings.mode.confirmDesc", { cards: modes.find((m) => m.key === pendingMode)?.cards ?? 0 })}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setPendingMode(null)}
                  className="px-6 py-3 rounded-md bg-bg-surface text-text-secondary font-semibold"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleModeConfirm}
                  className="px-6 py-3 rounded-md bg-accent text-bg-primary font-semibold"
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
    <div className="bg-bg-surface rounded-lg p-4 grid-border">
      <PixelIcon name={icon} size={24} color={color} />
      <p className="font-display text-lg text-text-primary mt-1">{value}</p>
      <p className="text-caption">{label}</p>
    </div>
  );
}
