"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { NAV_ICONS } from "@/components/icons";
import { useGameStore } from "@/store/useGameStore";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useUIStore } from "@/store/useUIStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { MODE_CARD_COUNT, PHASE_MAX_CARDS } from "@/types/game";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import type { DictKey } from "@/i18n";

const navItems = [
  { href: "/", icon: NAV_ICONS.today, labelKey: "nav.challenge" as DictKey },
  { href: "/collection", icon: NAV_ICONS.collection, labelKey: "nav.collection" as DictKey },
  { href: "/playground", icon: NAV_ICONS.playground, labelKey: "nav.playground" as DictKey },
  { href: "/settings", icon: NAV_ICONS.settings, labelKey: "nav.settings" as DictKey },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { play } = useSound();
  const isMd = useMediaQuery("(min-width: 768px)");
  // Phase 12 R8 — 전정계 민감 사용자 대응. rise-in 애니 스킵 + whileTap scale
  //   을 0.9 (강한) 대신 0.97 (Emil 표준) 으로 약화. reduce 일 땐 아예 생략.
  const reducedMotion = useReducedMotion();
  const capturePhase = useGrowthStore((s) => s.capturePhase);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const isOpeningPack = useGameStore((s) => s.isOpeningPack);
  const daily = useGameStore((s) => s.daily);
  const progress = useGameStore((s) => s.progress);
  const minigamePhase = useMinigameStore((s) => s.phase);
  // 스플래시가 화면을 덮고 있는 동안은 네비 자체를 unmount → splash 끝나는 순간
  // 첫 mount 으로 enter 애니메이션(y:30→0 rise) 이 자연스럽게 재생됨.
  const splashActive = useUIStore((s) => s.splashActive);

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

  // 팩 오프너는 메인 페이지(/)에서만 표시되므로, 다른 페이지에서는 네비 숨기지 않음
  const hideForPack = isOpeningPack && pathname === "/";
  // 미니게임 런 중(idle 제외 전체) 네비 숨김 — 실수로 탭해서 티켓 소실되는 걸 차단
  // /minigame 직접 진입과 /playground 내 game 탭 양쪽 모두 커버
  const hideForMinigame =
    (pathname === "/minigame" || pathname === "/playground") && minigamePhase !== "idle";

  // Up Hero 던전 진행 중엔 네비 숨김 — 이벤트 페널/포기 CTA 와 겹침 방지.
  // Phase 9b — 전체 session 객체가 아닌 status 만 구독.
  //   tick 마다 session.log 가 바뀌면 BottomNav 도 리렌더되던 문제 해결.
  //   status 변화는 세션 시작/awaitingChoice/종료 시 드물게 발생.
  const upHeroStatus = useUpHeroStore((s) => s.currentSession?.status);
  const hideForUpHero =
    pathname === "/playground" &&
    (upHeroStatus === "active" ||
      upHeroStatus === "paused" ||
      upHeroStatus === "awaitingChoice");

  if (
    !isLoaded ||
    !hasCompletedOnboarding ||
    isSelectionReview ||
    hideForPack ||
    hideForMinigame ||
    hideForUpHero ||
    splashActive ||
    capturePhase !== "idle"
  )
    return null;

  return (
    <motion.nav
      // 스플래시 종료 직후 첫 mount 시 하단에서 부드럽게 rise-in.
      // 이후 같은 세션 내 재마운트는 거의 없음(layout 지속) — mount 시 1회만 재생.
      // Phase 12 R8 — reduced-motion 시 rise-in 스킵 (정적 표시).
      initial={reducedMotion ? false : { y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-10 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center gap-1 bg-bg-elevated/90 backdrop-blur-md rounded-full px-2 py-1.5 grid-border">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => play("select")}
              aria-label={t(item.labelKey)}
              aria-current={isActive ? "page" : undefined}
            >
              <motion.div
                /* Phase 12 R8 — Apple HIG / WCAG 2.5.5 최소 터치 영역 44×44px.
                     기존 px-4 py-2 (=32px 터치) → px-4 py-2.5 + min-h-[44px]
                     로 세로 확보. 가로는 active 시 label 포함 48px+ 로 충분.
                     whileTap scale 0.9 → 0.97 (Emil 표준). reduced-motion 시 생략. */
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full transition-all ${
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
    </motion.nav>
  );
}
