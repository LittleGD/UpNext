import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

/**
 * 가방 보드의 **탭 경로 계약**.
 *
 * 타일은 `<button data-bag-item>` 인데 onClick 이 없다 — 루트의 포인터 핸들러가
 * 유일한 터치·마우스 경로다. 그래서 `interactionLocked`(합성 모드) 를
 * `onPointerDown` 에서 되돌리면 탭 선택까지 함께 죽어 **합성 재료를 보드에서
 * 고를 수 없게 된다** (2026-09 릴리스 블로커: 어떤 타일을 눌러도 "합성 1/3").
 *
 * 계약: 잠금은 **드래그 승격만** 막는다. 탭은 언제나 onSelect 로 간다.
 * iOS BagBoardView 도 가드를 DragGesture.onChanged 에만 둔다 (1:1 미러).
 */

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key, language: "ko" }),
}));
vi.mock("@/hooks/useAnnounce", () => ({
  useAnnounce: () => ({ announce: () => {} }),
}));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));
vi.mock("@/lib/sounds", () => ({
  playSound: () => {},
  triggerHaptic: () => {},
}));
vi.mock("@/store/useGameStore", () => ({
  useGameStore: (sel: (s: unknown) => unknown) =>
    sel({ progress: { soundEnabled: false, hapticEnabled: false } }),
}));

import BagBoard from "./BagBoard";
import { computeBagSynergy } from "@/lib/upHeroBag";
import type { Equipment, Hero } from "@/types/uphero";

afterEach(cleanup);

const ROWS = 4;

const mkItem = (over: Partial<Equipment> = {}): Equipment =>
  ({
    id: "i1",
    baseId: "ring_copper",
    name: "i1",
    type: "accessory",
    category: "fitness",
    rarity: "rare",
    iconName: "Zap",
    stats: { str: 1 },
    enhanceLevel: 0,
    bagX: 0,
    bagY: 0,
    bagRot: 0,
    ...over,
  }) as Equipment;

const EQUIPPED: Hero["equipped"] = {};

function setup(
  interactionLocked: boolean,
  inventory: Equipment[] = [mkItem()],
) {
  const onSelect = vi.fn();
  const onDropAt = vi.fn(() => ({ ok: true }) as never);
  const { container } = render(
    <BagBoard
      rows={ROWS}
      inventory={inventory}
      equipped={EQUIPPED}
      classType={null}
      heroVariant={0}
      selectedId={null}
      selectedSlot={null}
      placingRot={0}
      interactionLocked={interactionLocked}
      synergy={computeBagSynergy(EQUIPPED, inventory, ROWS)}
      newIds={new Set<string>()}
      onSelect={onSelect}
      onTapEmptyCell={() => {}}
      onTapWorn={() => {}}
      onTapHero={() => {}}
      onDropAt={onDropAt}
    />,
  );
  const tile = container.querySelector<HTMLElement>("[data-bag-item]");
  expect(tile).toBeTruthy();
  return { container, tile: tile!, onSelect, onDropAt };
}

const down = (el: HTMLElement, x = 100, y = 100) =>
  fireEvent.pointerDown(el, {
    isPrimary: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
  });
const move = (el: HTMLElement, x: number, y: number) =>
  fireEvent.pointerMove(el, {
    isPrimary: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
  });
const up = (el: HTMLElement, x = 100, y = 100) =>
  fireEvent.pointerUp(el, {
    isPrimary: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
  });

describe("BagBoard — 잠금 중 탭 경로", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("interactionLocked 여도 타일 탭은 onSelect 로 간다 (합성 재료 고르기)", () => {
    const { tile, onSelect } = setup(true);
    down(tile);
    up(tile);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("i1");
  });

  it("interactionLocked 중에는 임계값을 넘겨 움직여도 드래그가 시작되지 않는다", () => {
    const { tile, onSelect, onDropAt } = setup(true);
    down(tile, 100, 100);
    move(tile, 160, 160); // BAG_DRAG_THRESHOLD(6) 훨씬 초과
    // 드래그가 붙었다면 타일이 0.35 로 흐려진다.
    expect(tile.style.opacity).toBe("1");
    up(tile, 160, 160);
    expect(onDropAt).not.toHaveBeenCalled();
    // 승격이 막혔으므로 탭으로 끝난다.
    expect(onSelect).toHaveBeenCalledWith("i1");
  });

  it("잠금이 없으면 같은 이동이 드래그로 승격되어 탭 선택이 일어나지 않는다", () => {
    const { tile, onSelect } = setup(false);
    down(tile, 100, 100);
    move(tile, 160, 160);
    expect(tile.style.opacity).toBe("0.35");
    up(tile, 160, 160);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("잠금 없는 짧은 탭은 그대로 onSelect", () => {
    const { tile, onSelect } = setup(false);
    down(tile);
    up(tile);
    expect(onSelect).toHaveBeenCalledWith("i1");
  });
});
