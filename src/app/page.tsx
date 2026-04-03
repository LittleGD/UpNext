"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { loadFromStorage } from "@/lib/storage";
import CardDrawScreen from "@/components/daily/CardDrawScreen";
import DailyBoard from "@/components/daily/DailyBoard";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";

const CardPackOpener = dynamic(
  () => import("@/components/cards/CardPackOpener"),
  { ssr: false },
);
const LoginOverlay = dynamic(
  () => import("@/components/auth/LoginOverlay"),
  { ssr: false },
);
const BurningBorder = dynamic(
  () => import("@/components/effects/BurningBorder"),
  { ssr: false },
);
const MeteorShower = dynamic(
  () => import("@/components/effects/MeteorShower"),
  { ssr: false },
);

export default function Home() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const daily = useGameStore((s) => s.daily);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const isOpeningPack = useGameStore((s) => s.isOpeningPack);
  const dismissPackOpener = useGameStore((s) => s.dismissPackOpener);

  const [showLoginOverlay, setShowLoginOverlay] = useState(false);

  useEffect(() => {
    if (isLoaded && hasCompletedOnboarding && !daily.isDrawComplete) {
      const seen = loadFromStorage<boolean>("login_prompt_seen");
      if (!seen) setShowLoginOverlay(true);
    }
  }, [isLoaded, hasCompletedOnboarding, daily.isDrawComplete]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // ── 핵심 LCP 최적화 ──
  // 기존: !isLoaded → skeleton(무의미) → JS 하이드레이션 후 실제 콘텐츠 → LCP 8.2s
  // 개선: !isLoaded → OnboardingFlow SSR → 서버에서 실제 콘텐츠 렌더 → LCP = FCP
  //
  // 서버: isLoaded=false → OnboardingFlow 렌더 (첫 방문자에게 적합)
  // 클라이언트 하이드레이션: 동일 → 불일치 없음
  // initialize() 후: isLoaded=true → 기존 사용자는 DailyBoard로 전환
  if (!isLoaded || !hasCompletedOnboarding) {
    return <OnboardingFlow />;
  }

  // phase-aware 화면 전환
  const phase = daily.challengePhase || "daily";
  const isCurrentDrawDone = phase === "daily" ? daily.isDrawComplete
    : phase === "extra" ? daily.extraDrawComplete
    : daily.superDrawComplete;
  const isCurrentSelectionDone = phase === "daily" ? daily.isSelectionComplete
    : phase === "extra" ? daily.extraSelectionComplete
    : daily.superSelectionComplete;
  const showBoard = isCurrentSelectionDone;

  // phase별 완료 여부 — 완료 시 이펙트 제거
  const extraCards = daily.extraSelectedCards ?? [];
  const extraDone = extraCards.length > 0 && (daily.extraCompletedIds?.length ?? 0) >= extraCards.length;
  const superCards = daily.superSelectedCards ?? [];
  const superDone = superCards.length > 0 && (daily.superCompletedIds?.length ?? 0) >= superCards.length;

  const burningActive =
    (phase === "extra" && !extraDone) ||
    (phase === "super" && !superDone);

  return (
    <>
      {/* 추가 챌린지 글로벌 이펙트 — 진행 중일 때만 표시, 완료 시 제거 */}
      <BurningBorder phase={phase === "daily" ? "extra" : phase} active={burningActive} />
      <MeteorShower active={phase === "super" && !superDone} />

      <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
        {isOpeningPack ? (
          <CardPackOpener onComplete={dismissPackOpener} />
        ) : showBoard ? (
          <DailyBoard />
        ) : (
          <CardDrawScreen />
        )}

        <AnimatePresence>
          {showLoginOverlay && (
            <LoginOverlay onDismiss={() => setShowLoginOverlay(false)} />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
