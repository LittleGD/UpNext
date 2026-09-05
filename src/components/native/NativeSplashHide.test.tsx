/**
 * 스플래시 브리지 회귀 테스트.
 *
 * 세 경로를 고정한다:
 *   1. splashActive=true 신호 → 즉시 html.boot-cover-done (모든 셸).
 *   2. 신호 없음 → 600ms 폴백에서만 done (599ms 에는 아직 아님).
 *   3. isNative() 일 때만 SplashScreen.hide() 를 정확히 한 번 부른다 (신호가 두 번 와도).
 */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT_COVER_DONE_CLASS } from "@/lib/bootCover";
import { useUIStore } from "@/store/useUIStore";

const isNativeMock = vi.fn(() => false);
vi.mock("@/lib/platform", () => ({
  isNative: () => isNativeMock(),
}));

const hideMock = vi.fn(() => Promise.resolve());
vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({ hide: hideMock })),
}));

import NativeSplashHide from "./NativeSplashHide";

const hasDone = () => document.documentElement.classList.contains(BOOT_COVER_DONE_CLASS);

async function flushMicrotasks(): Promise<void> {
  // hideNativeSplash 는 @capacitor/core 를 동적 import 하므로 마이크로태스크 몇 틱이 필요하다.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("NativeSplashHide", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    useUIStore.setState({ splashActive: false, splashDismissed: false });
    isNativeMock.mockReturnValue(false);
    hideMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.documentElement.className = "";
    useUIStore.setState({ splashActive: false, splashDismissed: false });
  });

  it("splashActive 가 켜지면 즉시 부트 커버를 걷는다 (비네이티브)", () => {
    render(<NativeSplashHide />);
    expect(hasDone()).toBe(false);

    act(() => {
      useUIStore.getState().setSplashActive(true);
    });

    expect(hasDone()).toBe(true);
    expect(hideMock).not.toHaveBeenCalled();
  });

  it("이미 splashActive 인 상태로 마운트되면 즉시 걷는다", () => {
    useUIStore.setState({ splashActive: true });
    render(<NativeSplashHide />);
    expect(hasDone()).toBe(true);
  });

  it("신호가 없으면 600ms 폴백에서 걷는다 (599ms 에는 아직)", () => {
    vi.useFakeTimers();
    render(<NativeSplashHide />);

    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(hasDone()).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(hasDone()).toBe(true);
  });

  it("네이티브에서는 SplashScreen.hide() 를 정확히 한 번 부른다 (신호 2회 + 폴백)", async () => {
    isNativeMock.mockReturnValue(true);
    vi.useFakeTimers();
    render(<NativeSplashHide />);

    act(() => {
      useUIStore.getState().setSplashActive(true);
    });
    act(() => {
      useUIStore.getState().setSplashActive(false);
    });
    act(() => {
      useUIStore.getState().setSplashActive(true);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(hasDone()).toBe(true);
    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("언마운트 뒤에는 폴백 타이머가 돌지 않는다", () => {
    vi.useFakeTimers();
    const { unmount } = render(<NativeSplashHide />);
    unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hasDone()).toBe(false);
  });
});
