"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useGameStore } from "@/store/useGameStore";
import type { GameMode } from "@/types/game";
import type { Category } from "@/types/card";
import type { TitleDefinition } from "@/types/title";
import { getTitleForLevel } from "@/types/game";
import { ALL_TITLES, getEarnedTitleIds, categoryLabel } from "@/data/titles";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import PixelIcon from "@/components/icons/PixelIcon";
import AuthSection from "@/components/auth/AuthSection";
import AccordionSection from "@/components/ui/AccordionSection";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useAuthStore } from "@/store/useAuthStore";
import { deleteCloudData } from "@/lib/sync";
import { isAndroidTwa } from "@/lib/platform";
import GbConfirm from "@/components/uphero/GbConfirm";
import { motion, AnimatePresence } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import { titleName } from "@/i18n";
import {
  requestNotificationPermission,
  getNotificationPermission,
  getNotificationPermissionAsync,
  scheduleLocalReminder,
  cancelLocalReminder,
} from "@/lib/notifications";

const modes: { key: GameMode; labelKey: DictKey; descKey: DictKey; cards: number }[] = [
  { key: "normal", labelKey: "settings.mode.normal", descKey: "settings.mode.normal.desc", cards: 1 },
  { key: "godlife", labelKey: "settings.mode.godlife", descKey: "settings.mode.godlife.desc", cards: 2 },
  { key: "ultra", labelKey: "settings.mode.ultra", descKey: "settings.mode.ultra.desc", cards: 3 },
];

const CATEGORY_ORDER: Category[] = [
  "fitness", "nutrition", "mindfulness", "learning", "social", "productivity", "wellness", "trending",
];

// TWA 감지 — src/app/page.tsx 179-184행과 동일한 uSES 패턴 (SSR-safe,
// referrer/localStorage 스냅샷이라 세션 중 불변). 홈에서만 뜨던 마이그레이션
// 배너를 설정 화면 상단에도 노출해 발견성을 높인다.
const subscribeNoop = () => () => {};
const getIsTwaSnapshot = () => isAndroidTwa();
const getIsTwaServerSnapshot = () => false;

const AndroidMigrationBanner = dynamic(
  () => import("@/components/auth/AndroidMigrationBanner"),
  { ssr: false },
);
const LoginOverlay = dynamic(
  () => import("@/components/auth/LoginOverlay"),
  { ssr: false },
);

export default function SettingsPage() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const progress = useGameStore((s) => s.progress);
  const setMode = useGameStore((s) => s.setMode);
  const cancelPendingMode = useGameStore((s) => s.cancelPendingMode);
  const toggleSound = useGameStore((s) => s.toggleSound);
  const toggleHaptic = useGameStore((s) => s.toggleHaptic);
  const setNotificationsEnabled = useGameStore((s) => s.setNotificationsEnabled);
  const setNotificationTime = useGameStore((s) => s.setNotificationTime);
  const equipTitle = useGameStore((s) => s.equipTitle);
  const authUser = useAuthStore((s) => s.user);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);
  // 초기값을 lazy initializer 로 직접 읽는다 (SSR 은 "unsupported" 반환, 화면은 isLoaded 스켈레톤 뒤라 hydration 안전).
  // 권한 요청 후에는 핸들러에서 setNotifPermission 으로 갱신.
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    () => getNotificationPermission(),
  );
  // Phase 13 review dev cleanup — window.confirm 대신 커스텀 GbConfirm 다이얼로그.
  //   pixel-art 디자인 시스템 일관성 + i18n 제목/본문 명확 표기.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [showLoginOverlay, setShowLoginOverlay] = useState(false);
  const isTwaClient = useSyncExternalStore(
    subscribeNoop,
    getIsTwaSnapshot,
    getIsTwaServerSnapshot,
  );

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  // 네이티브(안드로이드 Capacitor)는 권한 조회가 비동기라 마운트 후 정확한 값으로 갱신.
  // (동기 초기값은 위 lazy initializer — 네이티브에선 "default" 낙관값)
  // Promise .then 의 setState 는 비동기 콜백이라 react-hooks/set-state-in-effect 비대상.
  useEffect(() => {
    void getNotificationPermissionAsync().then(setNotifPermission);
  }, []);

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

  // 획득 칭호 그룹핑 (컬렉션과 동일한 카테고리/특별/연속/추가 챌린지 순서)
  const groupConfigs: Array<{ key: string; label: string; filter: (tt: TitleDefinition) => boolean }> = [
    ...CATEGORY_ORDER.map((cat) => ({
      key: `cat-${cat}`,
      label: t("collection.titles.categoryTitles", { category: categoryLabel(cat, language) }),
      filter: (tt: TitleDefinition) =>
        tt.condition.type === "category" && tt.condition.category === cat,
    })),
    { key: "special", label: t("collection.titles.special"), filter: (tt) => tt.condition.type === "card" },
    { key: "streak", label: t("collection.titles.streak"), filter: (tt) => tt.condition.type === "streak" },
    { key: "extra", label: t("collection.titles.extra"), filter: (tt) => tt.condition.type === "extra" },
  ];
  const earnedGroups = groupConfigs
    .map((g) => {
      const allInGroup = ALL_TITLES.filter(g.filter);
      const earnedInGroup = allInGroup.filter((tt) => earnedIds.includes(tt.id));
      return { ...g, earnedTitles: earnedInGroup, total: allInGroup.length };
    })
    .filter((g) => g.earnedTitles.length > 0);

  return (
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto space-y-5">
      <h2 className="typo-title text-text-primary">{t("settings.title")}</h2>

      {/* ── Capacitor 전환 예고 배너 — TWA 에서만, 홈과 같은 대상·게이트.
            계정 화면 진입 지점이라 홈보다 여기서 로그인 전환율이 더 높을 수 있음. ── */}
      {isTwaClient && (
        <AndroidMigrationBanner onLogin={() => setShowLoginOverlay(true)} />
      )}

      {/* ── 비로그인 경고 ── */}
      {!authUser && progress.totalDaysCompleted > 0 && (
        <div className="rounded-lg bg-accent-secondary/10 border border-accent-secondary/20 px-4 py-3">
          <p className="typo-caption text-accent-secondary">{t("settings.dataWarning")}</p>
        </div>
      )}

      {/* ── 일반 설정 (언어 + 사운드) ── */}
      <section className="rounded-lg bg-bg-surface overflow-hidden">
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
        {/* 구분선 */}
        <div className="h-px bg-white/[0.06]" />
        {/* 햅틱 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <PixelIcon name="Sparkle" size={20} color="var(--text-secondary)" />
            <span className="typo-body text-text-primary">{t("settings.haptic")}</span>
          </div>
          <button
            onClick={() => { toggleHaptic(); if (!progress.hapticEnabled) play("select"); }}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              (progress.hapticEnabled ?? true) ? "bg-accent" : "bg-bg-elevated"
            }`}
          >
            <motion.div
              animate={{ x: (progress.hapticEnabled ?? true) ? 20 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white"
            />
          </button>
        </div>
        {/* 구분선 */}
        <div className="h-px bg-white/[0.06]" />
        {/* 알림 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <PixelIcon name="Sparkle" size={20} color="var(--text-secondary)" />
            <span className="typo-body text-text-primary">{t("settings.notifications")}</span>
          </div>
          <button
            onClick={async () => {
              if (progress.notificationsEnabled) {
                // 끄기
                setNotificationsEnabled(false);
                cancelLocalReminder();
                play("cancel");
              } else {
                // 켜기 — 권한 요청
                const granted = await requestNotificationPermission();
                setNotifPermission(await getNotificationPermissionAsync());
                if (granted) {
                  setNotificationsEnabled(true);
                  scheduleLocalReminder(
                    progress.notificationTime,
                    t("notif.daily.reminder.body"),
                    language,
                  );
                  play("confirm");
                }
              }
            }}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              progress.notificationsEnabled ? "bg-accent" : "bg-bg-elevated"
            }`}
          >
            <motion.div
              animate={{ x: progress.notificationsEnabled ? 20 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white"
            />
          </button>
        </div>
        {/* 알림 시간 선택 (알림 활성화 시) */}
        {progress.notificationsEnabled && (
          <>
            <div className="h-px bg-white/[0.06]" />
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="typo-body text-text-secondary pl-8">{t("settings.notifications.time")}</span>
              <input
                type="time"
                value={progress.notificationTime}
                onChange={(e) => {
                  setNotificationTime(e.target.value);
                  scheduleLocalReminder(e.target.value, t("notif.daily.reminder.body"), language);
                }}
                className="bg-bg-elevated text-text-primary rounded px-2 py-1 typo-body"
              />
            </div>
          </>
        )}
        {/* 알림 권한 거부 안내 */}
        {notifPermission === "denied" && (
          <>
            <div className="h-px bg-white/[0.06]" />
            <p className="px-4 py-2 typo-caption text-accent-secondary">{t("settings.notifications.denied")}</p>
          </>
        )}
      </section>

      {/* ── 챌린지 모드 ── */}
      <section className="space-y-2">
        <h3 className="typo-heading uppercase tracking-wider px-1">{t("settings.mode.heading")}</h3>
        <div className="rounded-lg bg-bg-surface overflow-hidden">
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
      <section className="space-y-3">
        <h3 className="typo-heading uppercase tracking-wider px-1">{t("settings.titles.heading")}</h3>

        {/* 레벨 칭호 */}
        <div className="space-y-2">
          <h4 className="typo-caption text-text-tertiary px-1">{t("settings.titles.level.heading")}</h4>
          <div className="rounded-lg bg-bg-surface overflow-hidden">
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
                    {t("settings.titles.level.label", { level: progress.level, title: defaultTitle })}
                  </span>
                </div>
                <span className="typo-micro text-text-tertiary">
                  {t("common.default")}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 획득 칭호 */}
        {earnedTitles.length > 0 ? (
          <div className="space-y-2">
            <h4 className="typo-caption text-text-tertiary px-1">{t("settings.titles.earned.heading")}</h4>
            <div className="space-y-3">
              {earnedGroups.map(({ key, label, earnedTitles: groupTitles, total }) => (
                <AccordionSection
                  key={key}
                  label={label}
                  count={groupTitles.length}
                  total={total}
                  defaultOpen={false}
                >
                  <div className="rounded-lg bg-bg-surface overflow-hidden mb-2">
                    {groupTitles.map((title, i) => {
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
                          {i < groupTitles.length - 1 && (
                            <div className="absolute bottom-0 left-4 right-4 h-px bg-white/[0.06]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </AccordionSection>
              ))}
            </div>
          </div>
        ) : (
          <p className="typo-caption text-text-tertiary px-4 py-3 rounded-lg bg-bg-surface">
            {t("settings.titles.empty")}
          </p>
        )}
      </section>

      {/* ── 계정 연동 ── */}
      <AuthSection />

      {/* ── 내 기록 ── */}
      <section className="space-y-2">
        <h3 className="typo-heading uppercase tracking-wider px-1">{t("settings.stats.heading")}</h3>
        {/* 스탯 4장 등고 — 라벨이 언어별로 1~2줄로 갈려 행마다 높이가 달랐다.
            auto-rows-fr 는 가장 큰 셀을 기준으로 모든 행을 맞추므로 고정 px 없이
            통일되고, 내용이 길어지면 행 자체가 커져 잘리지 않는다. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 auto-rows-fr">
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
        <Link
          href="/privacy"
          className="typo-caption text-text-tertiary hover:text-accent-secondary transition-colors block mb-4"
        >
          {t("settings.privacy")}
        </Link>
        <button
          onClick={() => {
            play("select");
            setResetConfirmOpen(true);
          }}
          className="typo-caption text-text-tertiary hover:text-accent-secondary transition-colors"
        >
          {t("settings.reset.button")}
        </button>
      </section>

      {/* Phase 13 review dev cleanup — window.confirm 제거. 디자인 시스템
            일관 custom modal (GbConfirm) 사용. 유저가 최종 확인 전 본문에
            세부 내용 (계정 연동 시 cloud 삭제 포함) 확인 가능. */}
      <GbConfirm
        open={resetConfirmOpen}
        danger
        title={t("settings.reset.button")}
        body={
          authUser
            ? t("settings.reset.confirmWithAccount")
            : t("settings.reset.confirmLocal")
        }
        confirmLabel={t("common.confirmDefault")}
        cancelLabel={t("common.cancelDefault")}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={async () => {
          setResetConfirmOpen(false);
          const currentAuthUser = useAuthStore.getState().user;
          if (currentAuthUser) {
            try {
              await deleteCloudData(currentAuthUser.uid);
              await useAuthStore.getState().signOut();
            } catch (e) {
              if (process.env.NODE_ENV !== "production") {
                console.error("Cloud data deletion failed:", e);
              }
            }
          }
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith("upnext_")) localStorage.removeItem(key);
          });
          window.location.href = "/";
        }}
      />

      {/* Phase 12 R12 — 앱 버전 표시 + 제작자 크레딧 (설정 맨 아래).
           작게 dim 처리해 시각 무게 최소. 크레딧 문구는 영문 고정 — i18n 카탈로그
           비대상. 외부 링크는 Capacitor(안드로이드)에서는 시스템 브라우저,
           웹에서는 새 탭으로 열린다. */}
      <section className="pt-2 text-center space-y-1.5">
        <p className="typo-micro text-text-tertiary">Designed &amp; built by Jongmin Lee</p>
        <p className="typo-micro text-text-secondary">
          <a
            href="https://www.linkedin.com/in/jongmin-lee-design/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent active:text-accent transition-colors"
          >
            LinkedIn
          </a>
          <span className="text-text-tertiary opacity-60 mx-2">·</span>
          <a
            href="https://www.jongmin.design"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent active:text-accent transition-colors"
          >
            Portfolio
          </a>
        </p>
        <p className="typo-micro text-text-tertiary opacity-60 tabular-nums">
          UpNext v0.2.0
        </p>
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

      {/* ── 마이그레이션 배너 CTA → 로그인 오버레이 (홈과 동일 컴포넌트 재사용) ── */}
      <AnimatePresence>
        {showLoginOverlay && (
          <LoginOverlay onDismiss={() => setShowLoginOverlay(false)} />
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
    <div className="bg-bg-surface rounded-lg p-3.5">
      <PixelIcon name={icon} size={20} color={color} />
      <p className="typo-heading text-text-primary mt-1.5 tabular-nums">{value}</p>
      <p className="typo-caption text-text-tertiary">{label}</p>
    </div>
  );
}
