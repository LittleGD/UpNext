/**
 * SSR 부트 커버 회귀 테스트.
 *
 * BOOT_COVER_INIT_SCRIPT 는 head 인라인 문자열이라 번들러가 검사하지 않는다. new Function 으로
 * jsdom 에서 실제 실행해 네 가지 감지 경로(display-mode standalone / navigator.standalone /
 * window.Capacitor / 안드로이드 WebView UA)와 "일반 브라우저에서는 절대 켜지지 않는다" 를
 * 고정한다. BOOT_COVER_STYLE 은 상수가 표류하면 커버가 조용히 깨지므로 문자열 단언으로 묶는다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOOT_COVER_COLOR,
  BOOT_COVER_DONE_CLASS,
  BOOT_COVER_EXPIRE_MS,
  BOOT_COVER_HTML_CLASS,
  BOOT_COVER_ID,
  BOOT_COVER_INIT_SCRIPT,
  BOOT_COVER_STYLE,
  BOOT_COVER_Z_INDEX,
  markBootCoverDone,
} from "./bootCover";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ANDROID_WEBVIEW_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36";

type MutableWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

function runInitScript(): void {
  // 인라인 스크립트와 동일하게 전역 window/navigator/document 를 그대로 쓴다.
  new Function(BOOT_COVER_INIT_SCRIPT)();
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function stubUserAgent(ua: string): void {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

describe("BOOT_COVER_INIT_SCRIPT", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    stubMatchMedia(false);
    stubUserAgent(DESKTOP_UA);
    delete (window as MutableWindow).Capacitor;
    Object.defineProperty(navigator, "standalone", { value: undefined, configurable: true });
  });

  afterEach(() => {
    document.documentElement.className = "";
    vi.unstubAllGlobals();
    delete (window as MutableWindow).Capacitor;
  });

  it("display-mode standalone 이면 html 에 boot-cover 를 붙인다", () => {
    stubMatchMedia(true);
    runInitScript();
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(true);
  });

  it("일반 데스크톱 브라우저에서는 붙이지 않는다", () => {
    runInitScript();
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(false);
  });

  it("window.Capacitor.isNativePlatform() 이 true 면 붙인다 (display-mode 는 browser)", () => {
    (window as MutableWindow).Capacitor = { isNativePlatform: () => true };
    runInitScript();
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(true);
  });

  it("안드로이드 WebView UA('; wv)')면 붙인다", () => {
    stubUserAgent(ANDROID_WEBVIEW_UA);
    runInitScript();
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(true);
  });

  it("iOS navigator.standalone === true 면 붙인다", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    runInitScript();
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(true);
  });

  it("matchMedia 가 없어도 예외 없이 끝난다", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(false);
  });
});

describe("BOOT_COVER_STYLE", () => {
  it("상수와 셀렉터가 표류하지 않는다", () => {
    expect(BOOT_COVER_ID).toBe("boot-cover");
    expect(BOOT_COVER_HTML_CLASS).toBe("boot-cover");
    expect(BOOT_COVER_DONE_CLASS).toBe("boot-cover-done");
    expect(BOOT_COVER_Z_INDEX).toBe(59);
    expect(BOOT_COVER_EXPIRE_MS).toBe(8000);
    expect(BOOT_COVER_COLOR).toBe("#0A0A0A");

    expect(BOOT_COVER_STYLE).toContain("#boot-cover{display:none;position:fixed;inset:0;");
    expect(BOOT_COVER_STYLE).toContain("html.boot-cover #boot-cover{display:block}");
    expect(BOOT_COVER_STYLE).toContain("html.boot-cover-done #boot-cover{display:none}");
    expect(BOOT_COVER_STYLE).toContain("@media (display-mode: standalone)");
    expect(BOOT_COVER_STYLE).toContain("z-index:59");
    expect(BOOT_COVER_STYLE).toContain("#0A0A0A");
    expect(BOOT_COVER_STYLE).toContain("linear 8s forwards");
    expect(BOOT_COVER_STYLE).toContain("@keyframes boot-cover-expire{to{visibility:hidden}}");
    expect(BOOT_COVER_STYLE).toContain("pointer-events:none");
  });

  it("done 규칙이 활성 규칙보다 뒤에 와서 캐스케이드에서 이긴다", () => {
    const activeIdx = BOOT_COVER_STYLE.indexOf("html.boot-cover #boot-cover");
    const mediaIdx = BOOT_COVER_STYLE.indexOf("@media (display-mode: standalone)");
    const doneIdx = BOOT_COVER_STYLE.indexOf("html.boot-cover-done #boot-cover");
    expect(activeIdx).toBeGreaterThan(-1);
    expect(mediaIdx).toBeGreaterThan(activeIdx);
    expect(doneIdx).toBeGreaterThan(mediaIdx);
  });
});

describe("markBootCoverDone", () => {
  afterEach(() => {
    document.documentElement.className = "";
  });

  it("html 에 boot-cover-done 을 붙이고 기존 클래스는 유지한다 (멱등)", () => {
    document.documentElement.className = "dark boot-cover";
    markBootCoverDone();
    markBootCoverDone();
    expect(document.documentElement.classList.contains(BOOT_COVER_DONE_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains(BOOT_COVER_HTML_CLASS)).toBe(true);
    expect(document.documentElement.className.split(" ").filter((c) => c === BOOT_COVER_DONE_CLASS)).toHaveLength(1);
  });
});
