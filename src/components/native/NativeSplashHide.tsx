"use client";

/**
 * 스플래시 브리지 — 모든 셸 공통. 두 가지 커버를 "웹이 준비된 정확한 순간" 에 걷는다.
 *
 *   1. SSR 부트 커버 (src/lib/bootCover.ts, layout.tsx 의 #boot-cover):
 *      TWA / 설치형 PWA / Capacitor 전부. markBootCoverDone() 으로 html 에 boot-cover-done 을
 *      붙여 CSS 가 커버를 숨긴다(DOM 제거 없음).
 *   2. Capacitor 네이티브 런치 스플래시 (isNative() 일 때만):
 *      capacitor.config.ts 의 launchShowDuration(6000) 은 오프라인·멈춘 로드용 상한이고, 정상
 *      경로에서는 여기서 SplashScreen.hide() 를 불러 즉시 걷는다. hide() 가 pre-draw 리스너를
 *      제거하므로 뒤늦게 도는 타이머는 no-op 이다.
 *
 * 걷어내는 순간:
 *   useUIStore.splashActive 가 true 로 바뀌는 순간 = 웹 SplashScreen(모션, z-60) 이 마운트되어
 *   첫 페인트를 마친 직후. 커버(z-59)와 네이티브 다크 아래에 이미 다크 배경 + 모션이 그려져
 *   있으므로 이음새 없이 이어진다.
 *
 * 폴백:
 *   딥링크·비루트 경로·reduced-motion 등 모션 스플래시가 마운트되지 않는 진입에서는
 *   splashActive 가 켜지지 않는다. 마운트(= 웹 번들 하이드레이션 완료) 후 FALLBACK_MS 안에
 *   신호가 없으면 둘 다 걷어 콘텐츠를 드러낸다. 하이드레이션 자체가 실패하면 이 컴포넌트는
 *   실행되지 않으며, bootCover.ts 의 8초 CSS 만료가 마지막 안전망이다.
 *
 * 플러그인 호출은 src/lib/widget.ts 선례와 같이 @capacitor/core 를 동적 import 해
 * registerPlugin("SplashScreen") 으로 프록시를 얻는다. 루트 package.json 에
 * @capacitor/splash-screen 이 없어도 네이티브 셸(ios-app)이 등록한 플러그인이라 동작하며,
 * 어떤 실패도 try/catch 로 무해화한다.
 */

import { useEffect } from "react";
import { isNative } from "@/lib/platform";
import { markBootCoverDone } from "@/lib/bootCover";
import { useUIStore } from "@/store/useUIStore";

/**
 * splashActive 신호가 없을 때 커버를 걷기까지 기다리는 상한.
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
    let fired = false;
    let unsubscribe: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (fired) return;
      fired = true;
      unsubscribe?.();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      markBootCoverDone();
      if (isNative()) void hideNativeSplash();
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
