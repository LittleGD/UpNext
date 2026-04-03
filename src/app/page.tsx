"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { loadFromStorage } from "@/lib/storage";
import CardDrawScreen from "@/components/daily/CardDrawScreen";
import DailyBoard from "@/components/daily/DailyBoard";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";

// ── Phase 4: 조건부 컴포넌트 동적 import ──
// OnboardingFlow, CardPackOpener, LoginOverlay는 조건부 렌더링이므로 초기 번들 불필요
const OnboardingFlow = dynamic(
  () => import("@/components/onboarding/OnboardingFlow"),
  { ssr: false },
);
const CardPackOpener = dynamic(
  () => import("@/components/cards/CardPackOpener"),
  { ssr: false },
);
const LoginOverlay = dynamic(
  () => import("@/components/auth/LoginOverlay"),
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

  // 온보딩 완료 후 + 첫 드로우 전 + 로그인 프롬프트 미확인 시 오버레이 표시
  useEffect(() => {
    if (isLoaded && hasCompletedOnboarding && !daily.isDrawComplete) {
      const seen = loadFromStorage<boolean>("login_prompt_seen");
      if (!seen) setShowLoginOverlay(true);
    }
  }, [isLoaded, hasCompletedOnboarding, daily.isDrawComplete]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="skeleton w-48 h-6" />
          <div className="skeleton w-32 h-4" />
          <div className="skeleton w-full max-w-xs h-20 mt-4" />
          <div className="skeleton w-full max-w-xs h-20" />
          <div className="skeleton w-full max-w-xs h-20" />
        </div>
      </div>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingFlow />;
  }

  return (
    <div className="px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
      {isOpeningPack ? (
        <CardPackOpener onComplete={dismissPackOpener} />
      ) : daily.isSelectionComplete ? (
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
  );
}
