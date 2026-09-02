import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * 굴림틀 "한 번 더" — 스토어 `spinSlotAgain` 계약 (iOS `UpHeroStore.spinSlotAgain` 1:1).
 *
 *  - 활성 세션에 굴림틀 choice 를 다시 꽂고 즉시 0번으로 해소 → 새 slot 결과 엔트리
 *  - 하루 상한(SLOT_DAILY_SPIN_CAP, `shopDaily.slotSpins`)·런 수입(SLOT_SPIN_COST)
 *    게이트에 막히면 로그·스트릭 불변
 *  - 스트릭 입력·갱신은 resolveChoice 한 곳에서만 — pity 가 "한 번 더" 경로에서도 산다
 *  - 오늘 굴림 카운터도 resolveChoice 한 곳에서만 +1 — "한 번 더" 와 이벤트 굴림이 같은
 *    하루 카운터를 쓴다
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore, slotSpinsToday } from "./useUpHeroStore";
import { getTodayString } from "./useGameStore";
import { createSession } from "@/lib/upHeroCombat";
import { resetRng } from "@/lib/upHeroRng";
import { SLOT_DAILY_SPIN_CAP, SLOT_PITY_THRESHOLD, SLOT_SPIN_COST } from "@/lib/upHeroSlot";
import { createDefaultHero, type CombatSession } from "@/types/uphero";

const ROLL_BLANK = 0.1;

function activeSession(coins = 1000): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.rewards.coins = coins;
  s.status = "active";
  return s;
}

/** 오늘 이미 n 회 굴린 상태. 카운터는 세션이 아니라 shopDaily 에 있다. */
function seedSpinsToday(n: number) {
  useUpHeroStore.setState({
    shopDaily: { date: getTodayString(), passesBought: 0, slotSpins: n },
  });
}

const spinsToday = () => slotSpinsToday(useUpHeroStore.getState().shopDaily);

function slotEntries() {
  const s = useUpHeroStore.getState().currentSession;
  return (s?.log ?? []).filter((e) => e.type === "choiceResult" && e.slot);
}

function spinAgain(roll = ROLL_BLANK) {
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValueOnce(roll);
  spy.mockReturnValue(0.5);
  useUpHeroStore.getState().spinSlotAgain();
  spy.mockRestore();
}

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

describe("spinSlotAgain", () => {
  it("활성 세션에서 굴림틀을 다시 굴려 새 slot 결과가 붙고 비용이 걷힌다", () => {
    useUpHeroStore.setState({ currentSession: activeSession(1000) });
    seedSpinsToday(1);
    spinAgain();
    const s = useUpHeroStore.getState().currentSession!;
    expect(slotEntries()).toHaveLength(1);
    expect(s.status).toBe("active");
    expect(s.pendingChoiceIndex).toBeUndefined();
    // 오늘 카운터 +1 — 세션이 아니라 shopDaily 가 센다.
    expect(spinsToday()).toBe(2);
    expect("slotSpins" in s).toBe(false);
    expect(s.rewards.coins).toBe(1000 - SLOT_SPIN_COST);
    // 꽝 난수 → 스트릭 +1 (resolveChoice 경로를 탔다는 증거)
    expect(useUpHeroStore.getState().slotBlankStreak).toBe(1);
  });

  it("오늘 상한에 닿았으면 아무 일도 하지 않는다", () => {
    const s = activeSession(1000);
    useUpHeroStore.setState({ currentSession: s, slotBlankStreak: 2 });
    seedSpinsToday(SLOT_DAILY_SPIN_CAP);
    spinAgain();
    expect(useUpHeroStore.getState().currentSession).toBe(s);
    expect(useUpHeroStore.getState().slotBlankStreak).toBe(2);
    expect(spinsToday()).toBe(SLOT_DAILY_SPIN_CAP);
  });

  it("런 수입이 비용 미만이면 아무 일도 하지 않는다", () => {
    const s = activeSession(SLOT_SPIN_COST - 1);
    useUpHeroStore.setState({ currentSession: s });
    spinAgain();
    expect(useUpHeroStore.getState().currentSession).toBe(s);
    expect(slotEntries()).toHaveLength(0);
    expect(spinsToday()).toBe(0);
  });

  it("세션이 active 가 아니면(선택 대기·일시정지) 굴리지 않는다", () => {
    const s = { ...activeSession(), status: "paused" as const };
    useUpHeroStore.setState({ currentSession: s });
    spinAgain();
    expect(useUpHeroStore.getState().currentSession).toBe(s);
  });

  it("pity 는 '한 번 더' 경로에서도 산다 — 스트릭 4 면 꽝 난수도 보상", () => {
    useUpHeroStore.setState({
      currentSession: activeSession(1000),
      slotBlankStreak: SLOT_PITY_THRESHOLD - 1,
    });
    spinAgain(ROLL_BLANK);
    const [entry] = slotEntries();
    expect(entry.type === "choiceResult" && entry.slot?.outcome).not.toBe("blank");
    expect(useUpHeroStore.getState().slotBlankStreak).toBe(0);
  });

  it("상한까지 연속으로 굴리면 정확히 SLOT_DAILY_SPIN_CAP 개의 결과만 붙는다", () => {
    useUpHeroStore.setState({ currentSession: activeSession(10_000) });
    for (let i = 0; i < SLOT_DAILY_SPIN_CAP + 3; i += 1) spinAgain();
    expect(slotEntries()).toHaveLength(SLOT_DAILY_SPIN_CAP);
    expect(spinsToday()).toBe(SLOT_DAILY_SPIN_CAP);
    expect(useUpHeroStore.getState().currentSession!.rewards.coins).toBe(
      10_000 - SLOT_DAILY_SPIN_CAP * SLOT_SPIN_COST,
    );
  });
});
