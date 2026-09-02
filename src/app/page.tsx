"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useUIStore } from "@/store/useUIStore";
import { loadFromStorage } from "@/lib/storage";
import { isAndroidTwa, isNative } from "@/lib/platform";
import CardDrawScreen from "@/components/daily/CardDrawScreen";
import DailyBoard from "@/components/daily/DailyBoard";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import SplashScreen from "@/components/onboarding/SplashScreen";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";

// "앱으로 설치되어 실행 중" 판정 — 모션 스플래시 표시 조건.
// PWA(display-mode) · iOS 홈화면(navigator.standalone) · Capacitor WebView(isNative) 를 모두 포함.
// Capacitor 안드로이드는 display-mode 매칭에 의존하지 않고 명시적으로 포함해야 안전하다.
function isStandalone() {
  if (typeof window === "undefined") return false;
  return isNative()
    || window.matchMedia("(display-mode: standalone)").matches
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

// login_prompt_seen 도 같은 uSES 패턴 — LoginOverlay 가 저장(항상 onDismiss 와 짝)하므로
// 세션 중 값이 바뀌면 다음 렌더에서 자연히 반영된다. 서버/첫 hydration 은 "seen" 취급해 오버레이 숨김.
const getLoginPromptSeenSnapshot = () =>
  loadFromStorage<boolean>("login_prompt_seen") === true;
const getLoginPromptSeenServerSnapshot = () => true;

// TWA 감지도 같은 uSES 패턴 — referrer/localStorage 스냅샷이라 세션 중 불변.
// 서버/첫 hydration 은 false (일반 배너 경로) → 클라이언트에서 TWA 면 전환.
const getIsTwaSnapshot = () => isAndroidTwa();
const getIsTwaServerSnapshot = () => false;

const CardPackOpener = dynamic(
  () => import("@/components/cards/CardPackOpener"),
  { ssr: false },
);
const CollectionCelebration = dynamic(
  () => import("@/components/cards/CollectionCelebration"),
  { ssr: false },
);
const BackupReminderBanner = dynamic(
  () => import("@/components/auth/BackupReminderBanner"),
  { ssr: false },
);
const AndroidMigrationBanner = dynamic(
  () => import("@/components/auth/AndroidMigrationBanner"),
  { ssr: false },
);
const AndroidFirstLaunchModal = dynamic(
  () => import("@/components/auth/AndroidFirstLaunchModal"),
  { ssr: false },
);
const WelcomeCoinsOverlay = dynamic(
  () => import("@/components/onboarding/WelcomeCoinsOverlay"),
  { ssr: false },
);
const LoginOverlay = dynamic(
  () => import("@/components/auth/LoginOverlay"),
  { ssr: false },
);
const FortuneToast = dynamic(
  () => import("@/components/daily/FortuneToast"),
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

  // 오버레이 표시 여부 — 수동 열기/닫기(override)가 없으면 "최초 조건 충족 시 자동 표시" 파생값.
  // (기존 useEffect + setState 자동 오픈을 react-hooks/set-state-in-effect 준수 형태로 대체)
  const [overlayOverride, setOverlayOverride] = useState<"open" | "closed" | null>(null);
  const loginPromptSeen = useSyncExternalStore(
    subscribeNoop,
    getLoginPromptSeenSnapshot,
    getLoginPromptSeenServerSnapshot,
  );
  // TWA 여부 — 배너 분기용. 두 배너 모두 초기 비가시라 전환 깜빡임은 없다.
  const isTwaClient = useSyncExternalStore(
    subscribeNoop,
    getIsTwaSnapshot,
    getIsTwaServerSnapshot,
  );
  // PWA/TWA/Capacitor → 앱 열 때마다 모션 스플래시 표시 (세션당 1회).
  // 서버·첫 hydration 은 standalone=false 로 평가 → SSR HTML 은 OnboardingFlow 이고,
  // hydration 완료 직후 getSnapshot=true 로 전환되며 splashDismissed=false 이면 스플래시로 교체.
  // 그 사이 OnboardingFlow 가 한 프레임 페인트될 수 있다. 이 프레임을 가리는 것은 네이티브 셸의 책임:
  //   - TWA: 시스템 스플래시가 web load 까지 화면을 덮는다.
  //   - Capacitor 안드로이드: launchShowDuration(3000) 으로 붙잡아 둔 네이티브 스플래시를
  //     NativeSplashHide 가 splashActive=true 순간에 걷어낸다(0 이면 이 프레임이 그대로 노출된다).
  //   - 일반 브라우저: standalone=false 라 스플래시 자체를 쓰지 않으므로 해당 없음.
  const standalone = useSyncExternalStore(
    subscribeNoop,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot,
  );
  // splashDismissed 를 store 에 두어 /collection → / 뒤로 이동해도 스플래시 재시작 방지.
  // SplashScreen 자신이 dismissSplash() 를 호출하므로 여기서는 콜백이 no-op.
  const splashDismissed = useUIStore((s) => s.splashDismissed);
  const showSplash = standalone && !splashDismissed;

  const showLoginOverlay = overlayOverride
    ? overlayOverride === "open"
    : isLoaded && hasCompletedOnboarding && !daily.isDrawComplete && !loginPromptSeen;

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
        {/* 오늘의 기운 리마인더 — 진입 팝업을 스킵했고 아직 안 본 날에만 내려온다.
            콘텐츠 컬럼 맨 위, 뽑기 화면 위쪽에 자리를 차지할 뿐 덮지 않는다.
            표시 조건·하루 1회 게이트는 컴포넌트가 스스로 판단한다.
            팩 오프너 중에는 연출을 방해하지 않도록 마운트하지 않는다. */}
        {!isOpeningPack && <FortuneToast />}

        {/* P2 — 미로그인 + 진행 누적된 사용자에게 백업 안내. 카드팩 오픈 / 컬렉션
            축하 등 모달이 띄워진 상태에서는 자동으로 가려지므로 항상 마운트 가능.
            TWA 에서는 Capacitor 전환 예고 배너가 백업 배너를 대체한다 (같은 대상,
            문구가 백업+마이그레이션을 함께 다루므로 이중 노출 방지). */}
        {!isOpeningPack &&
          (isTwaClient ? (
            <AndroidMigrationBanner onLogin={() => setOverlayOverride("open")} />
          ) : (
            <BackupReminderBanner onLogin={() => setOverlayOverride("open")} />
          ))}
        {isOpeningPack ? (
          <CardPackOpener onComplete={dismissPackOpener} />
        ) : showBoard ? (
          <DailyBoard />
        ) : (
          <CardDrawScreen />
        )}

        <AnimatePresence>
          {showLoginOverlay && (
            <LoginOverlay onDismiss={() => setOverlayOverride("closed")} />
          )}
        </AnimatePresence>

        {/* 컬렉션 100% 첫 달성 축하 — store.collectionCelebration 토글 시 자동 마운트.
            CardPackOpener 닫힌 다음 프레임에 자연스럽게 등장. */}
        <CollectionCelebration />

        {/* 시작 선물 100코인 — 신규 유저 최초 1회. "받기" 를 눌러야 지급되며,
            온보딩·팩 오프너 중에는 오버레이 내부 가드가 마운트를 보류한다. */}
        <WelcomeCoinsOverlay />

        {/* Phase F — Android Capacitor 첫 실행 1회 백업 안내. PWA → Play Store 앱
            전환 시 데이터 격리로 인한 손실 방지. */}
        <AndroidFirstLaunchModal onLogin={() => setOverlayOverride("open")} />
      </div>
    </>
  );
}
