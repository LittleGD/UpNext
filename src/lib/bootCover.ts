/**
 * SSR 부트 커버 — 안드로이드 셸(TWA / 설치형 PWA / Capacitor)의 콜드 스타트에서
 * "온보딩 첫 화면이 한 프레임 번쩍" 하는 현상을 가리는 다크 레이어.
 *
 * 콜드 스타트 3단계:
 *   1. OS 스플래시 (TWA: Chrome 이 page load 에서 제거 / Capacitor: launchShowDuration 상한)
 *   2. SSR 부트 커버 (이 파일) — 서버가 그린 HTML 의 첫 페인트부터 하이드레이션까지
 *   3. 웹 모션 스플래시 (SplashScreen.tsx, z-[60]) — splashActive 가 켜지는 순간 커버는 끝
 *
 * 왜 getStandaloneServerSnapshot 을 true 로 바꾸지 않는가:
 *   page.tsx 는 LCP 를 위해 SSR 결과를 OnboardingFlow / DailyBoard 로 고정한다. 서버에서
 *   스플래시를 그리면 일반 브라우저 방문에도 3.2초 스플래시가 붙고 하이드레이션 결정성이
 *   깨진다. 대신 standalone / Capacitor 문맥에서만 켜지는 커버로 그 프레임을 가린다.
 *
 * 활성화 (첫 페인트 전):
 *   - head 인라인 IIFE(BOOT_COVER_INIT_SCRIPT)가 display-mode standalone / navigator.standalone /
 *     window.Capacitor.isNativePlatform() / 안드로이드 WebView UA('; wv)') 중 하나면 html 에
 *     BOOT_COVER_HTML_CLASS 를 붙인다. Capacitor 는 display-mode 가 browser 로 보고되므로
 *     CSS 만으로는 놓친다. Capacitor 의 JSInjector 는 '<head>' 직후에 브리지를 넣으므로
 *     이 스크립트 시점에 window.Capacitor 가 이미 있고, UA 검사는 이중 안전장치다.
 *   - 순수 CSS @media (display-mode: standalone) 규칙이 스크립트 없이도 같은 효과를 낸다.
 *
 * 해제:
 *   NativeSplashHide(모든 셸 공통 브리지)가 splashActive=true 또는 하이드레이션 후 600ms
 *   폴백에 markBootCoverDone() 을 불러 html 에 BOOT_COVER_DONE_CLASS 를 붙인다. DOM 노드는
 *   React 소유(layout.tsx)라 제거하지 않고 클래스만 토글한다(하이드레이션 불일치 방지).
 *   JS 가 끝내 실행되지 않으면 CSS 애니메이션이 BOOT_COVER_EXPIRE_MS 뒤 visibility 를 걷는다.
 *
 * z-index 59: SSR OnboardingFlow 의 ambient 레이어(z-50), Header/BottomNav(z-10) 위,
 * SplashScreen(z-60) 아래. 스플래시의 첫 프레임이 이미 보이는 상태에서 커버가 사라지므로
 * 다크 위 다크, 전환이 보이지 않는다.
 */

export const BOOT_COVER_ID = "boot-cover";
export const BOOT_COVER_HTML_CLASS = "boot-cover";
export const BOOT_COVER_DONE_CLASS = "boot-cover-done";
export const BOOT_COVER_Z_INDEX = 59;
/** JS 가 실행되지 않을 때 CSS 가 커버를 걷는 안전 상한. */
export const BOOT_COVER_EXPIRE_MS = 8000;
/** globals.css 의 --bg-primary 와 반드시 같아야 한다. */
export const BOOT_COVER_COLOR = "#0A0A0A";

/**
 * head 인라인 IIFE. next/script 가 아닌 일반 <script> 로 넣어 파싱 중 동기 실행되어야
 * 첫 페인트 전에 클래스가 붙는다.
 */
export const BOOT_COVER_INIT_SCRIPT =
  "(function(){try{var w=window,n=navigator,c=w.Capacitor;" +
  'var s=(w.matchMedia&&w.matchMedia("(display-mode: standalone)").matches)' +
  "||n.standalone===true" +
  "||!!(c&&c.isNativePlatform&&c.isNativePlatform())" +
  '||/; wv\\)/.test(n.userAgent||"");' +
  `if(s){document.documentElement.classList.add("${BOOT_COVER_HTML_CLASS}");}` +
  "}catch(e){}})();";

const EXPIRE_KEYFRAMES = "boot-cover-expire";

export const BOOT_COVER_STYLE =
  `#${BOOT_COVER_ID}{display:none;position:fixed;inset:0;z-index:${BOOT_COVER_Z_INDEX};` +
  `background:${BOOT_COVER_COLOR};pointer-events:none;` +
  `animation:${EXPIRE_KEYFRAMES} 0s linear ${BOOT_COVER_EXPIRE_MS / 1000}s forwards}` +
  `html.${BOOT_COVER_HTML_CLASS} #${BOOT_COVER_ID}{display:block}` +
  `@media (display-mode: standalone){#${BOOT_COVER_ID}{display:block}}` +
  `html.${BOOT_COVER_DONE_CLASS} #${BOOT_COVER_ID}{display:none}` +
  `@keyframes ${EXPIRE_KEYFRAMES}{to{visibility:hidden}}`;

/** 커버를 걷는다. 클래스만 추가하며 DOM 노드는 건드리지 않는다(멱등). */
export function markBootCoverDone(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(BOOT_COVER_DONE_CLASS);
}
