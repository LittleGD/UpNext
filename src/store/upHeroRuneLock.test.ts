import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * 룬 자물쇠 — 상태 층위 계약.
 *
 * `resolveRuneLock` 은 걸쇠 등급을 결과 엔트리에 적고 코인 차액만 런 수입에
 * 얹는다. 그 밖의 것은 아무것도 건드리지 않는다:
 *  - pity 스트릭(`slotBlankStreak`) 과 하루 카운터(`shopDaily.slotSpins`) 는
 *    상자를 연 시점에 이미 갱신됐다. 조작 등급이 그 값을 다시 흔들면 안 된다.
 *  - 조작 없이 모달이 닫히면 `"plain"` 으로 마감한다 → 코인 변화 0, 등급만 기록.
 *  - 세션에 새 대기 상태가 생기지 않는다.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore, slotSpinsLeft } from "./useUpHeroStore";
import { createSession } from "@/lib/upHeroCombat";
import { resetRng } from "@/lib/upHeroRng";
import { SLOT_EVENT } from "@/data/flavor/slot";
import { SLOT_DAILY_SPIN_CAP, SLOT_GRANTS } from "@/lib/upHeroSlot";
import { createDefaultHero, type CombatSession } from "@/types/uphero";

/** 원시 표에서 coinSmall(490..684) 에 떨어지는 난수. */
const ROLL_COIN_SMALL = 0.6;
/** 원시 표에서 blank(0..490) 에 떨어지는 난수. */
const ROLL_BLANK = 0.1;

function freshSession(coins = 1000): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.rewards.coins = coins;
  return s;
}

function armChest(s: CombatSession): CombatSession {
  const next: CombatSession = { ...s, log: [...s.log] };
  next.log.push({
    type: "choice",
    prompt: SLOT_EVENT.prompt,
    promptKey: SLOT_EVENT.promptKey,
    options: SLOT_EVENT.options,
    timestamp: Date.now(),
  });
  next.status = "awaitingChoice";
  next.pendingChoiceIndex = next.log.length - 1;
  return next;
}

/** 상자를 한 번 연다. 첫 난수를 고정해 결과를 정한다. 상자 엔트리 idx 를 돌려준다. */
function openChest(roll: number, session?: CombatSession): number {
  const base = session ?? useUpHeroStore.getState().currentSession ?? freshSession();
  useUpHeroStore.setState({ currentSession: armChest(base) });
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValueOnce(roll);
  spy.mockReturnValue(0.5);
  useUpHeroStore.getState().resolveChoice(0);
  spy.mockRestore();
  const s = useUpHeroStore.getState().currentSession;
  if (!s) return -1;
  for (let i = s.log.length - 1; i >= 0; i -= 1) {
    const e = s.log[i];
    if (e.type === "choiceResult" && e.slot) return i;
  }
  return -1;
}

function chestEntry(idx: number) {
  const s = useUpHeroStore.getState().currentSession;
  const e = s?.log[idx];
  if (!e || e.type !== "choiceResult" || !e.slot) throw new Error("상자 결과 없음");
  return e;
}

const runCoins = () => useUpHeroStore.getState().currentSession?.rewards.coins ?? 0;

beforeEach(() => {
  resetRng();
  useUpHeroStore.setState({
    hero: createDefaultHero("ko"),
    coins: 0,
    currentSession: null,
    slotBlankStreak: 0,
    shopDaily: undefined,
    isLoaded: true,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("resolveRuneLock — 스토어 배선", () => {
  it("perfect 는 코인 차액을 런 수입에 더하고 등급을 기록한다", () => {
    const idx = openChest(ROLL_COIN_SMALL);
    const grant = SLOT_GRANTS.coinSmall;
    if (grant.kind !== "coins") throw new Error("코인 지급이 아니다");
    const before = runCoins();
    useUpHeroStore.getState().resolveRuneLock(idx, "perfect");
    expect(runCoins() - before).toBe(130 - grant.amount);
    expect(chestEntry(idx).slot?.lockTier).toBe("perfect");
    expect(chestEntry(idx).effectSummaryData?.coins).toBe(130);
  });

  it("조작 없이 닫히면 plain — 코인은 그대로이고 상자는 해소된 채 남는다", () => {
    // 모달이 언마운트될 때 부르는 경로. 세션에 미해소 상자를 남기지 않는다.
    const idx = openChest(ROLL_COIN_SMALL);
    const before = runCoins();
    useUpHeroStore.getState().resolveRuneLock(idx, "plain");
    expect(runCoins()).toBe(before);
    expect(chestEntry(idx).slot?.lockTier).toBe("plain");
  });

  it("plain 으로 마감한 뒤에는 뒤늦은 perfect 도 먹히지 않는다", () => {
    const idx = openChest(ROLL_COIN_SMALL);
    useUpHeroStore.getState().resolveRuneLock(idx, "plain");
    const after = runCoins();
    useUpHeroStore.getState().resolveRuneLock(idx, "perfect");
    expect(runCoins()).toBe(after);
    expect(chestEntry(idx).slot?.lockTier).toBe("plain");
  });

  it("같은 등급을 두 번 불러도 보너스는 한 번만 붙는다", () => {
    const idx = openChest(ROLL_COIN_SMALL);
    const before = runCoins();
    useUpHeroStore.getState().resolveRuneLock(idx, "good");
    const once = runCoins();
    useUpHeroStore.getState().resolveRuneLock(idx, "good");
    expect(runCoins()).toBe(once);
    expect(once - before).toBe(15);
  });

  it("등급 해소는 하루 상한 카운터를 건드리지 않는다", () => {
    const idx = openChest(ROLL_COIN_SMALL);
    const left = slotSpinsLeft(useUpHeroStore.getState().shopDaily);
    expect(left).toBe(SLOT_DAILY_SPIN_CAP - 1);
    useUpHeroStore.getState().resolveRuneLock(idx, "perfect");
    expect(slotSpinsLeft(useUpHeroStore.getState().shopDaily)).toBe(left);
  });

  it("등급 해소는 pity 스트릭을 건드리지 않는다 — 꽝은 꽝인 채로 센다", () => {
    const idx = openChest(ROLL_BLANK);
    expect(chestEntry(idx).slot?.outcome).toBe("blank");
    expect(useUpHeroStore.getState().slotBlankStreak).toBe(1);
    useUpHeroStore.getState().resolveRuneLock(idx, "perfect");
    expect(useUpHeroStore.getState().slotBlankStreak).toBe(1);
  });

  it("세션이 없으면 아무 일도 하지 않는다", () => {
    useUpHeroStore.setState({ currentSession: null });
    expect(() => useUpHeroStore.getState().resolveRuneLock(0, "perfect")).not.toThrow();
    expect(useUpHeroStore.getState().currentSession).toBeNull();
  });

  it("상한까지 연 뒤에도 각 상자의 등급을 따로 해소할 수 있다", () => {
    const idxs: number[] = [];
    for (let i = 0; i < SLOT_DAILY_SPIN_CAP; i += 1) {
      idxs.push(openChest(ROLL_COIN_SMALL));
    }
    expect(slotSpinsLeft(useUpHeroStore.getState().shopDaily)).toBe(0);
    const before = runCoins();
    for (const idx of idxs) useUpHeroStore.getState().resolveRuneLock(idx, "perfect");
    // 상자 3개 × (130 - 100) = 90.
    expect(runCoins() - before).toBe(90);
    for (const idx of idxs) expect(chestEntry(idx).slot?.lockTier).toBe("perfect");
  });
});
