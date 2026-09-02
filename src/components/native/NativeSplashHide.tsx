"use client";

/**
 * Capacitor(안드로이드) 런치 스플래시 → 웹 모션 스플래시 브리지.
 *
 * 왜 필요한가:
 *   capacitor.config.ts 의 SplashScreen.launchShowDuration 이 0 이면 네이티브 스플래시가 즉시
 *   걷혀 WebView 의 원격 로드·SSR(OnboardingFlow)·하이드레이션이 전부 노출된다(온보딩 첫 화면이
 *   한 프레임 번쩍). 그래서 네이티브는 3000ms 상한으로 스플래시를 붙잡아 두고, 웹이 준비된
 *   "정확한 순간" 에 여기서 SplashScreen.hide() 를 불러 걷어낸다.
 *
 * 걷어내는 순간:
 *   useUIStore.splashActive 가 true 로 바뀌는 순간 = 웹 SplashScreen(모션) 이 마운트되어 첫
 *   페인트를 마친 직후(SplashScreen 의 useEffect 가 setSplashActive(true) 를 호출). 네이티브
 *   다크(#0A0A0A) 아래에 이미 다크 배경 + 모션 스플래시가 그려져 있으므로 이음새 없이 이어진다.
 *
 * 폴백:
 *   딥링크·비루트 경로 등 모션 스플래시가 마운트되지 않는 진입에서는 splashActive 가 켜지지
 *   않는다. 마운트 후 FALLBACK_MS 안에 신호가 없으면 hide() 를 불러 콘텐츠를 드러낸다.
 *   (이 컴포넌트는 layout.tsx 에 마운트되므로 "마운트" = 웹 번들 하이드레이션 완료 시점.)
 *
 * 플러그인 호출은 src/lib/widget.ts 선례와 같이 @capacitor/core 를 동적 import 해
 * registerPlugin("SplashScreen") 으로 프록시를 얻는다. 루트 package.json 에
 * @capacitor/splash-screen 이 없어도 네이티브 셸(ios-app)이 등록한 플러그인이라 동작하며,
 * 어떤 실패도 try/catch 로 무해화한다. 브라우저·TWA(isNative()=false)에서는 즉시 no-op.
 */

import { useEffect } from "react";
import { isNative } from "@/lib/platform";
import { useUIStore } from "@/store/useUIStore";

/**
 * splashActive 신호가 없을 때 hide() 까지 기다리는 상한.
 * 루트 진입에서는 하이드레이션 직후 page.tsx 가 SplashScreen 으로 교체되고 그 useEffect 가
 * 같은 프레임대에 splashActive 를 켜므로(수십 ms), 600ms 는 정상 경로를 절대 가로막지 않으면서
 * 비루트 진입의 빈 화면 체감을 최소화하는 값이다.
 */
const FALLBACK_MS = 600;

interface NativeSplashScreenPlugin {
  // 옵션 없이 부른다: 런치 스플래시(Android 12 API 경로)에서는 fadeOutDuration 인자가 무시되고
  // 경고 로그만 남는다. 페이드는 config 의 launchFadeOutDuration(0) 이 결정한다.
  hide(): Promise<void>;
}

async function hideNativeSplash(): Promise<void> {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<NativeSplashScreenPlugin>("SplashScreen");
    await plugin.hide();
  } catch {
    // 플러그인 미등록·이미 숨김 등 — 앱 동작에 영향 없음
  }
}

export default function NativeSplashHide() {
  useEffect(() => {
    if (!isNative()) return;

    let fired = false;
    let unsubscribe: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (fired) return;
      fired = true;
      unsubscribe?.();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      void hideNativeSplash();
    };

    // 이미 켜져 있으면(스플래시가 먼저 마운트된 경우) 즉시.
    if (useUIStore.getState().splashActive) {
      fire();
      return;
    }

    unsubscribe = useUIStore.subscribe((state) => {
      if (state.splashActive) fire();
    });
    fallbackTimer = setTimeout(fire, FALLBACK_MS);

    return () => {
      unsubscribe?.();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    };
  }, []);

  return null;
}
