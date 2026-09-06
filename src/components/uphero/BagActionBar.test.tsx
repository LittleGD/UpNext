import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

/**
 * 가방 액션바의 레이아웃 계약.
 *
 * 액션 버튼 줄은 언어마다 폭이 다르다 (en 기준 497px > 375px). 그래서 버튼은
 * 가로 스크롤 안에 두되 **취소는 스크롤 밖 오른쪽에 고정**한다 — 취소는 선택
 * 상태를 터치로 빠져나가는 유일한 길이라 항상 화면에 있어야 한다.
 *
 * 사진 부적은 강화 상한이 +10 이라, 상한에 닿으면 강화 버튼 자체를 내린다.
 */

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key, language: "ko" }),
}));

import BagActionBar from "./BagActionBar";
import type { Equipment } from "@/types/uphero";

afterEach(cleanup);

const noop = () => {};

const base = {
  wornSlot: null,
  placing: false,
  trayCount: 0,
  rotatable: false,
  synthMode: false,
  synthCount: 0,
  canStartSynth: false,
  onPlace: noop,
  onRotate: noop,
  onEquip: noop,
  onUnequip: noop,
  onEnhance: noop,
  onSell: noop,
  onCancel: noop,
  onSynth: noop,
  onSynthConfirm: noop,
  onSynthCancel: noop,
} as const;

const mkItem = (over: Partial<Equipment> = {}): Equipment =>
  ({
    id: "i1",
    baseId: "sword_iron",
    name: "i1",
    type: "weapon",
    category: "fitness",
    rarity: "rare",
    iconName: "Sword",
    stats: { str: 3 },
    enhanceLevel: 0,
    ...over,
  }) as Equipment;

/** 버튼 라벨 — styled-jsx 의 <style> 이 textContent 에 섞이므로 첫 노드만 읽는다. */
const label = (b: Element) => b.firstChild?.textContent?.trim() ?? "";

const findBtn = (root: HTMLElement, key: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => label(b) === key);

const cancelBtn = (root: HTMLElement) =>
  findBtn(root, "uphero.bag.action.cancel");

const scroller = (root: HTMLElement) =>
  root.querySelector(".overflow-x-auto") as HTMLElement | null;

describe("BagActionBar — 취소 고정", () => {
  const cases: Array<[string, Partial<React.ComponentProps<typeof BagActionBar>>]> = [
    ["아이템 선택", { item: mkItem() }],
    ["배치 모드", { item: mkItem(), placing: true }],
    ["착용 슬롯 선택", { item: null, wornSlot: "weapon" }],
    ["합성 모드", { item: mkItem(), synthMode: true }],
  ];

  for (const [label, props] of cases) {
    it(`${label} 에서 취소는 가로 스크롤 밖에 있다`, () => {
      const { container } = render(
        <BagActionBar {...base} item={null} {...props} />,
      );
      const cancel = cancelBtn(container);
      expect(cancel).toBeTruthy();
      const strip = scroller(container);
      expect(strip).toBeTruthy();
      // 스크롤 영역이 취소를 품고 있으면 좁은 폭에서 화면 밖으로 밀린다.
      expect(strip!.contains(cancel!)).toBe(false);
      expect(cancel!.parentElement).toBe(container.firstElementChild);
    });
  }

  it("유휴 상태에는 벗어날 선택이 없어 취소를 띄우지 않는다", () => {
    const { container } = render(<BagActionBar {...base} item={null} />);
    expect(cancelBtn(container)).toBeUndefined();
  });
});

describe("BagActionBar — 사진 부적 강화 상한", () => {
  const enhanceBtn = (root: HTMLElement) =>
    findBtn(root, "uphero.equip.tabEnhance");

  it("상한(+10)에 닿은 사진 부적은 강화 버튼을 내린다", () => {
    const { container } = render(
      <BagActionBar
        {...base}
        item={mkItem({ type: "talisman", photoId: "p1", enhanceLevel: 10 })}
      />,
    );
    expect(enhanceBtn(container)).toBeUndefined();
  });

  it("상한 아래 사진 부적과 일반 장비는 강화 버튼을 보인다", () => {
    const { container: a } = render(
      <BagActionBar
        {...base}
        item={mkItem({ type: "talisman", photoId: "p1", enhanceLevel: 9 })}
      />,
    );
    expect(enhanceBtn(a)).toBeTruthy();
    const { container: b } = render(
      <BagActionBar {...base} item={mkItem({ enhanceLevel: 19 })} />,
    );
    expect(enhanceBtn(b)).toBeTruthy();
  });
});
