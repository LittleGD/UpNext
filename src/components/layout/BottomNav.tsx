"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { NAV_ICONS } from "@/components/icons";
import { useGameStore } from "@/store/useGameStore";
import { MODE_CARD_COUNT } from "@/types/game";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";

const navItems = [
  { href: "/", icon: NAV_ICONS.today, labelKey: "nav.challenge" as DictKey },
  { href: "/collection", icon: NAV_ICONS.collection, labelKey: "nav.collection" as DictKey },
  { href: "/settings", icon: NAV_ICONS.settings, labelKey: "nav.settings" as DictKey },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const daily = useGameStore((s) => s.daily);
  const progress = useGameStore((s) => s.progress);

  // 선택 리뷰 화면(선택 완료 but 미확정)에서 네비 숨김
  const maxCards = MODE_CARD_COUNT[progress.mode];
  const isInSelectionReview =
    pathname === "/" &&
    daily.isDrawComplete &&
    !daily.isSelectionComplete &&
    daily.selectedCards.length >= maxCards;

  if (!isLoaded || !hasCompletedOnboarding || isInSelectionReview) return null;

  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-1 bg-bg-elevated/90 backdrop-blur-md rounded-full px-2 py-1.5 grid-border">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
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
                    className="text-[13px] md:text-[15px] font-semibold overflow-hidden whitespace-nowrap"
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
