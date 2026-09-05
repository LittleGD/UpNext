import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

/**
 * 문지르기 의식의 상호작용 계약 — 세그먼트 보간으로 한 줄 스와이프가 행 전체를
 * 걷고, 16칸에서 남은 타일이 걷힌 뒤 260ms 뒤에야 onReveal 이 1회 오며,
 * 드래그 하나에 선택 햅틱 세션이 정확히 한 번 열리고 닫힌다.
 */

const sounds = vi.hoisted(() => ({
  beginSelectionHaptics: vi.fn(),
  endSelectionHaptics: vi.fn(),
  triggerHaptic: vi.fn(),
}));
vi.mock("@/lib/sounds", () => sounds);
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key, language: "ko" }),
}));
vi.mock("@/store/useGameStore", () => ({
  useGameStore: (selector: (s: { progress: { hapticEnabled: boolean } }) => unknown) =>
    selector({ progress: { hapticEnabled: true } }),
}));
vi.mock("@/components/icons/PixelIcon", () => ({
  default: () => null,
}));

import AuraScratch from "./AuraScratch";

const W = 280;
const H = 400;

function tiles(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-scratch-tile]"));
}
function offTiles(container: HTMLElement): number {
  return tiles(container).filter((el) => el.style.opacity === "0").length;
}
function hint(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[data-scratch-hint]")!;
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(sounds)) fn.mockClear();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: W,
    bottom: H,
    width: W,
    height: H,
    toJSON: () => ({}),
  } as DOMRect);
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AuraScratch", () => {
  it("한 줄 스와이프는 보간으로 그 행 7칸을 걷고, 임계 전에는 onReveal 이 없다", () => {
    const onReveal = vi.fn();
    const { container, getByRole } = render(<AuraScratch colorHex="#ff0000" onReveal={onReveal} />);
    const cover = getByRole("button");

    expect(tiles(container)).toHaveLength(35);
    expect(offTiles(container)).toBe(0);
    expect(hint(container).style.opacity).toBe("1");

    fireEvent.pointerDown(cover, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(sounds.beginSelectionHaptics).toHaveBeenCalledTimes(1);
    expect(sounds.triggerHaptic).toHaveBeenCalledWith("select");
    expect(offTiles(container)).toBe(1);

    fireEvent.pointerMove(cover, { pointerId: 1, clientX: 270, clientY: 10 });
    expect(offTiles(container)).toBe(7);
    // 첫 행(0..6)이 전부 걷혔다
    const row0 = tiles(container).slice(0, 7);
    for (const el of row0) expect(el.style.opacity).toBe("0");
    expect(onReveal).not.toHaveBeenCalled();
    // 7/35 = 0.2 → 1 - 0.2*1.8 = 0.64
    expect(Number(hint(container).style.opacity)).toBeCloseTo(0.64);

    fireEvent.pointerUp(cover, { pointerId: 1 });
    expect(sounds.endSelectionHaptics).toHaveBeenCalledTimes(1);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("16칸에 닿으면 전 타일이 걷히고 260ms 뒤 onReveal 이 정확히 1회, 세션은 드래그당 1회 열리고 닫힌다", () => {
    const onReveal = vi.fn();
    const { container, getByRole } = render(<AuraScratch colorHex="#ff0000" onReveal={onReveal} />);
    const cover = getByRole("button");

    fireEvent.pointerDown(cover, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cover, { pointerId: 1, clientX: 270, clientY: 10 });
    expect(offTiles(container)).toBe(7);
    // 오른쪽 열을 타고 내려간다: col 6 의 row 1..4 → +4 = 11
    fireEvent.pointerMove(cover, { pointerId: 1, clientX: 270, clientY: 390 });
    expect(offTiles(container)).toBe(11);
    expect(onReveal).not.toHaveBeenCalled();
    expect(sounds.triggerHaptic).not.toHaveBeenCalledWith("cardFlip");
    // 마지막 행을 반쯤: row 4 의 col 5..3 → +3 = 14 → 임박 구간(13~15) → cardFlip 1회
    fireEvent.pointerMove(cover, { pointerId: 1, clientX: 150, clientY: 390 });
    expect(offTiles(container)).toBe(14);
    expect(sounds.triggerHaptic.mock.calls.filter(([n]) => n === "cardFlip")).toHaveLength(1);
    expect(onReveal).not.toHaveBeenCalled();
    // 나머지: col 2..0 → +3 = 17 ≥ 16 → finish
    fireEvent.pointerMove(cover, { pointerId: 1, clientX: 10, clientY: 390 });
    expect(offTiles(container)).toBe(35);
    expect(hint(container).style.opacity).toBe("0");
    // 임박 틱은 여전히 1회
    expect(sounds.triggerHaptic.mock.calls.filter(([n]) => n === "cardFlip")).toHaveLength(1);
    // 걷힘이 보이기 전엔 공개하지 않는다
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(259);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledTimes(1);

    // 임계 도달에서 세션이 닫혔고, 뒤따르는 pointerup 은 다시 닫지 않는다
    fireEvent.pointerUp(cover, { pointerId: 1 });
    expect(sounds.beginSelectionHaptics).toHaveBeenCalledTimes(1);
    expect(sounds.endSelectionHaptics).toHaveBeenCalledTimes(1);

    // 공개 뒤의 입력은 무시된다
    fireEvent.pointerDown(cover, { pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(cover, { pointerId: 2 });
    vi.advanceTimersByTime(1000);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(sounds.beginSelectionHaptics).toHaveBeenCalledTimes(1);
  });

  it("드래그 중 언마운트되면 햅틱 세션을 닫는다", () => {
    const onReveal = vi.fn();
    const { container, unmount } = render(<AuraScratch colorHex="#ff0000" onReveal={onReveal} />);
    const cover = container.querySelector("button") as HTMLButtonElement;
    fireEvent.pointerDown(cover, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(sounds.beginSelectionHaptics).toHaveBeenCalledTimes(1);
    unmount();
    expect(sounds.endSelectionHaptics).toHaveBeenCalledTimes(1);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("키보드(Enter)는 문지르기 없이 peel → onReveal 경로를 탄다", () => {
    const onReveal = vi.fn();
    const { container, getByRole } = render(<AuraScratch colorHex="#ff0000" onReveal={onReveal} />);
    const cover = getByRole("button");
    fireEvent.keyDown(cover, { key: "Enter" });
    expect(offTiles(container)).toBe(35);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(260);
    expect(onReveal).toHaveBeenCalledTimes(1);
    // 드래그가 없었으니 세션도 없다
    expect(sounds.beginSelectionHaptics).not.toHaveBeenCalled();
    expect(sounds.endSelectionHaptics).not.toHaveBeenCalled();
  });
});
