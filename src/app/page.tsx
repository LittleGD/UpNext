"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useUIStore } from "@/store/useUIStore";
import { loadFromStorage } from "@/lib/storage";
import CardDrawScreen from "@/components/daily/CardDrawScreen";
import DailyBoard from "@/components/daily/DailyBoard";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import SplashScreen from "@/components/onboarding/SplashScreen";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

// useSyncExternalStore — standalone 상태를 SSR-safe 하게 읽는다.
// subscribe 는 no-op (앱 런타임 중 display-mode 가 바뀌지 않으므로 reactive 구독 불필요).
// getServerSnapshot 이 false 를 반환하므로 SSR·첫 hydration 은 browser 경로와 동일,
// hydration 완료 후 getSnapshot 으로 전환되며 실제 standalone 값을 반영한다.
// 이 패턴은 useEffect + setState 대신 파생 상태를 사용해 react-hooks/set-state-in-effect 규칙을 준수.
const subscribeNoop = () => () => {};
const getStandaloneSnapshot = () => isStandalone();
const getStandaloneServerSnapshot = () => false;

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
  // PWA/TWA → 앱 열 때마다 모션 스플래시 표시 (세션당 1회).
  // 서버·첫 hydration 은 standalone=false 로 평가 → OnboardingFlow/DailyBoard 가 렌더 시도되지만,
  // hydration 완료 직후 getSnapshot=true 로 전환되며 splashDismissed=false 이면 스플래시로 교체.
  // TWA native splash(fadeout=0)가 web load 까지 화면을 가리므로 1프레임 딜레이는 인지 불가 (< 16ms).
  const standalone = useSyncExternalStore(
    subscribeNoop,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot,
  );
  // splashDismissed 를 store 에 두어 /collection → / 뒤로 이동해도 스플래시 재시작 방지.
  // SplashScreen 자신이 dismissSplash() 를 호출하므로 여기서는 콜백이 no-op.
  const splashDismissed = useUIStore((s) => s.splashDismissed);
  const showSplash = standalone && !splashDismissed;

  useEffect(() => {
    if (isLoaded && hasCompletedOnboarding && !daily.isDrawComplete) {
      const seen = loadFromStorage<boolean>("login_prompt_seen");
      if (!seen) setShowLoginOverlay(true);
    }
  }, [isLoaded, hasCompletedOnboarding, daily.isDrawComplete]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // ── 모션 스플래시 (PWA/TWA 전용) ──
  // 기존·신규 유저 모두 앱 실행 시 워드마크 애니메이션 2.8초 표시.
  // 브라우저에서는 standalone=false 이므로 자동으로 스킵.
  // 스플래시 중에도 initialize() 는 이미 useEffect로 실행되므로
  // 완료 시점에는 isLoaded=true 상태로 즉시 전환 가능.
  // onComplete 는 splash 가 내부 fade-out 후 자체적으로 dismissSplash() 를 호출한 뒤 실행되므로
  // 여기서는 "렌더 조건 재평가용 no-op 콜백" — store 업데이트가 자동으로 re-render 트리거.
  if (showSplash) {
    return <SplashScreen onComplete={() => {}} />;
  }

  // ── 핵심 LCP 최적화 ──
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
