import { describe, it, expect, vi } from "vitest";

/**
 * Phase 15 — 방지권 소모 계약의 **통계적** 회귀 테스트.
 *
 * useUpHeroStore.test.ts 는 outcome roll 을 손으로 집어 각 갈래를 하나씩 못박는다.
 * 여기서는 반대로, 확률을 실제로 굴린 채 스토어를 2만 번 돌려 계약이 총량으로도
 * 성립하는지 본다. 손으로 집은 롤은 "그 갈래가 맞다" 만 보증하고, 갈래를 가르는
 * 경계가 어긋났는지는 못 잡는다 — 그건 분포로만 드러난다.
 *
 * 계약: **막아낸 순간에만** 1장 소모된다. 성공·유지에서는 0장.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore } from "./useUpHeroStore";
import { createDefaultHero, enhanceOutcomeRates } from "@/types/uphero";
import type { Equipment } from "@/types/uphero";
import { setRngSeed, resetRng } from "@/lib/upHeroRng";

/** rare +8 — 실패 시 소실 20% / 하락 40% / 유지 40%. 세 갈래가 모두 두툼해 분포로 갈린다. */
const LEVEL = 8;
const N = 20000;
/** 20,000 시행에서 ±1.5%p 는 표준오차(약 0.3%p)의 5배 — 우연으로는 넘지 못한다. */
const TOLERANCE = 0.015;

function makeItem(): Equipment {
  return {
    id: "sim",
    baseId: "sword_iron",
    name: `쇠검 +${LEVEL}`,
    type: "weapon",
    rarity: "rare",
    iconName: "Sword",
    stats: { str: 10 },
    enhanceLevel: LEVEL,
  } as Equipment;
}

function seedState(destroyGuards: number, downGuards: number): void {
  useUpHeroStore.setState({
    hero: createDefaultHero("ko"),
    inventory: [makeItem()],
    coins: 10_000_000,
    destroyGuards,
    downGuards,
    isLoaded: true,
  });
}

describe("방지권 소모 계약 — 확률을 실제로 굴린 총량 검증", () => {
  it("소모 총량이 '막아낸 횟수' 와 정확히 일치한다", () => {
    setRngSeed(424242);
    let guardedDestroy = 0;
    let guardedDown = 0;
    let keep = 0;
    let success = 0;
    let destroyGuardSpent = 0;
    let downGuardSpent = 0;

    for (let i = 0; i < N; i += 1) {
      seedState(50, 50);
      const before = useUpHeroStore.getState();
      const heldD = before.destroyGuards ?? 0;
      const heldU = before.downGuards ?? 0;
      const r = useUpHeroStore
        .getState()
        .enhanceItem("sim", { destroy: true, down: true });
      const after = useUpHeroStore.getState();
      const spentD = heldD - (after.destroyGuards ?? 0);
      const spentU = heldU - (after.downGuards ?? 0);
      destroyGuardSpent += spentD;
      downGuardSpent += spentU;

      if (r.ok) {
        success += 1;
        expect(spentD).toBe(0); // 성공에서는 절대 소모하지 않는다
        expect(spentU).toBe(0);
      } else if (r.reason === "keep") {
        keep += 1;
        expect(spentD).toBe(0); // 막을 것이 없던 실패도 소모하지 않는다
        expect(spentU).toBe(0);
      } else if (r.reason === "guarded" && r.guard === "destroy") {
        guardedDestroy += 1;
        expect(spentD).toBe(1);
        expect(spentU).toBe(0); // 소실·하락은 배타적 — 한 시도에 둘이 같이 나가지 않는다
      } else if (r.reason === "guarded" && r.guard === "down") {
        guardedDown += 1;
        expect(spentU).toBe(1);
        expect(spentD).toBe(0);
      } else {
        // 방지권을 둘 다 걸고 보유도 충분하므로 실제 소실/하락은 나올 수 없다.
        throw new Error(`막혔어야 할 결과가 그대로 났다: ${JSON.stringify(r)}`);
      }
    }

    expect(destroyGuardSpent).toBe(guardedDestroy);
    expect(downGuardSpent).toBe(guardedDown);

    // 막아낸 비율이 표기 확률과 일치하는가 — UI 숫자와 판정이 같은 표를 쓰는지의 증거.
    const fails = guardedDestroy + guardedDown + keep;
    const rates = enhanceOutcomeRates("rare", LEVEL);
    expect(success + fails).toBe(N);
    expect(Math.abs(guardedDestroy / fails - rates.destroy)).toBeLessThan(TOLERANCE);
    expect(Math.abs(guardedDown / fails - rates.down)).toBeLessThan(TOLERANCE);
    resetRng();
  }, 120000);

  it("보유 0 이면 토글을 켜도 소실이 정상적으로 일어나고 개수는 음수가 되지 않는다", () => {
    setRngSeed(99991);
    let destroyed = 0;
    let down = 0;
    let keep = 0;
    let success = 0;

    for (let i = 0; i < N; i += 1) {
      seedState(0, 0);
      const r = useUpHeroStore
        .getState()
        .enhanceItem("sim", { destroy: true, down: true });
      const after = useUpHeroStore.getState();
      expect(after.destroyGuards).toBe(0); // 음수로 내려가지 않는다
      expect(after.downGuards).toBe(0);
      if (r.ok) success += 1;
      else if (r.reason === "destroyed") destroyed += 1;
      else if (r.reason === "down") down += 1;
      else if (r.reason === "keep") keep += 1;
      else throw new Error(`보유 0 인데 막혔다: ${JSON.stringify(r)}`);
    }

    const fails = destroyed + down + keep;
    const rates = enhanceOutcomeRates("rare", LEVEL);
    expect(success + fails).toBe(N);
    // 보유가 없으면 원래 위험이 그대로 굴러야 한다 — 조용히 봐주는 경로가 없는지 확인.
    expect(Math.abs(destroyed / fails - rates.destroy)).toBeLessThan(TOLERANCE);
    expect(Math.abs(down / fails - rates.down)).toBeLessThan(TOLERANCE);
    resetRng();
  }, 120000);
});
