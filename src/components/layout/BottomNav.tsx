"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { NAV_ICONS } from "@/components/icons";
import { useGameStore } from "@/store/useGameStore";
import { MODE_CARD_COUNT, PHASE_MAX_CARDS } from "@/types/game";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import type { DictKey } from "@/i18n";

const navItems = [
  { href: "/", icon: NAV_ICONS.today, labelKey: "nav.challenge" as DictKey },
  { href: "/collection", icon: NAV_ICONS.collection, labelKey: "nav.collection" as DictKey },
  { href: "/settings", icon: NAV_ICONS.settings, labelKey: "nav.settings" as DictKey },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { play } = useSound();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const isOpeningPack = useGameStore((s) => s.isOpeningPack);
  const daily = useGameStore((s) => s.daily);
  const progress = useGameStore((s) => s.progress);

  // 선택 리뷰 화면(선택 완료 but 미확정)에서 네비 숨김
  const maxCards = MODE_CARD_COUNT[progress.mode];
  const phase = daily.challengePhase || "daily";

  // 선택 리뷰 화면 (선택 완료 but 미확정) — 모든 phase 공통
  const isDailySelectionReview =
    pathname === "/" &&
    phase === "daily" &&
    daily.isDrawComplete &&
    !daily.isSelectionComplete &&
    daily.selectedCards.length >= maxCards;

  const isExtraSelectionReview =
    pathname === "/" &&
    phase === "extra" &&
    (daily.extraDrawComplete ?? false) &&
    !(daily.extraSelectionComplete ?? false) &&
    (daily.extraSelectedCards?.length ?? 0) >= PHASE_MAX_CARDS.extra;

  const isSuperSelectionReview =
    pathname === "/" &&
    phase === "super" &&
    (daily.superDrawComplete ?? false) &&
    !(daily.superSelectionComplete ?? false) &&
    (daily.superSelectedCards?.length ?? 0) >= PHASE_MAX_CARDS.super;

  const isSelectionReview = isDailySelectionReview || isExtraSelectionReview || isSuperSelectionReview;

  if (!isLoaded || !hasCompletedOnboarding || isSelectionReview || isOpeningPack) return null;

  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-1 bg-bg-elevated/90 backdrop-blur-md rounded-full px-2 py-1.5 grid-border">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={() => play("select")}>
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full transition-all ${
                  isActive
                    ? "bg-accent text-bg-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <PixelIcon name={item.icon} size={isMd ? 24 : 20} />
                {isActive && (
                  <motion.span
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    className="typo-caption overflow-hidden whitespace-nowrap"
                  >
                    {t(item.labelKey)}
                  </motion.span>
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
