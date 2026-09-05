import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 선택 햅틱 세션 계약 — beginSelectionHaptics / triggerHaptic("select") /
 * endSelectionHaptics 가 네이티브(Capacitor)와 비네이티브(navigator.vibrate)에서
 * 각각 어떤 호출로 풀리는지 고정한다.
 */

const { isNativeMock, haptics } = vi.hoisted(() => ({
  isNativeMock: vi.fn<() => boolean>(() => false),
  haptics: {
    selectionStart: vi.fn(async () => {}),
    selectionChanged: vi.fn(async () => {}),
    selectionEnd: vi.fn(async () => {}),
    impact: vi.fn(async () => {}),
    notification: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/platform", () => ({
  isNative: () => isNativeMock(),
}));
vi.mock("@capacitor/haptics", () => ({
  Haptics: haptics,
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

import {
  __resetSelectionHapticsForTests,
  beginSelectionHaptics,
  endSelectionHaptics,
  triggerHaptic,
} from "./sounds";

/** 동적 import(@capacitor/haptics) + await 체인은 매크로태스크를 타므로 폴링으로 기다린다 */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 30));
}

/** 호출 순서를 하나의 배열로 — 세션 밖 self-wrapping 의 start→changed→end 를 검증한다 */
function callOrder(): string[] {
  const entries: Array<[string, number]> = [];
  for (const name of ["selectionStart", "selectionChanged", "selectionEnd"] as const) {
    for (const order of haptics[name].mock.invocationCallOrder) entries.push([name, order]);
  }
  return entries.sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

beforeEach(() => {
  __resetSelectionHapticsForTests();
  for (const fn of Object.values(haptics)) fn.mockClear();
  isNativeMock.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("네이티브(Capacitor) 선택 세션", () => {
  beforeEach(() => isNativeMock.mockReturnValue(true));

  it("begin → selectionStart 1회, 세션 중 select → selectionChanged 만, end → selectionEnd", async () => {
    beginSelectionHaptics();
    await flush();
    expect(haptics.selectionStart).toHaveBeenCalledTimes(1);

    triggerHaptic("select");
    triggerHaptic("select");
    await flush();
    expect(haptics.selectionChanged).toHaveBeenCalledTimes(2);
    expect(haptics.selectionStart).toHaveBeenCalledTimes(1);
    expect(haptics.selectionEnd).not.toHaveBeenCalled();

    endSelectionHaptics();
    await flush();
    expect(haptics.selectionEnd).toHaveBeenCalledTimes(1);
  });

  it("세션 밖의 단발 select 는 start → changed → end 를 스스로 감싼다", async () => {
    triggerHaptic("select");
    await flush();
    expect(callOrder()).toEqual(["selectionStart", "selectionChanged", "selectionEnd"]);
  });

  it("selection 의도 전체(cardSelect/equip 등)가 같은 self-wrapping 을 탄다", async () => {
    triggerHaptic("equip");
    await flush();
    expect(callOrder()).toEqual(["selectionStart", "selectionChanged", "selectionEnd"]);
  });

  it("polaroidSlide(공개 사운드)는 Light 임팩트와 짝이다", async () => {
    triggerHaptic("polaroidSlide");
    await flush();
    expect(haptics.impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(haptics.selectionStart).not.toHaveBeenCalled();
  });
});

describe("비네이티브(TWA/PWA, navigator.vibrate)", () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  });

  it("begin/end 는 Capacitor 를 건드리지 않는다", async () => {
    beginSelectionHaptics();
    endSelectionHaptics();
    await flush();
    expect(haptics.selectionStart).not.toHaveBeenCalled();
    expect(haptics.selectionEnd).not.toHaveBeenCalled();
  });

  it("세션 밖 select → vibrate(0) 리셋 뒤 10ms 에 클램프된 [25]", () => {
    vi.useFakeTimers();
    triggerHaptic("select");
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenNthCalledWith(1, 0);
    vi.advanceTimersByTime(10);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenNthCalledWith(2, [25]);
  });

  it("세션 중 select → 리셋·클램프 없이 vibrate(10), 60ms 당 최대 1회", () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    beginSelectionHaptics();
    triggerHaptic("select");
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenNthCalledWith(1, 10);

    // 40ms 틱 간격으로 들어오는 두 번째 틱은 60ms 창 안이라 버린다
    now += 40;
    triggerHaptic("select");
    expect(vibrate).toHaveBeenCalledTimes(1);

    // 80ms 째(직전 진동 이후 80ms) → 통과
    now += 40;
    triggerHaptic("select");
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenNthCalledWith(2, 10);

    // 타이머를 돌려도 지연 vibrate 는 예약돼 있지 않다(리셋 경로를 타지 않았다)
    vi.advanceTimersByTime(100);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).not.toHaveBeenCalledWith(0);

    // 세션 중이라도 selection 의도가 아닌 햅틱(cardFlip = light)은 기존 경로
    triggerHaptic("cardFlip");
    expect(vibrate).toHaveBeenLastCalledWith(0);

    // 세션을 닫으면 select 도 기존 경로로 돌아간다
    endSelectionHaptics();
    vibrate.mockClear();
    triggerHaptic("select");
    expect(vibrate).toHaveBeenNthCalledWith(1, 0);
    vi.advanceTimersByTime(10);
    expect(vibrate).toHaveBeenNthCalledWith(2, [25]);
  });
});
