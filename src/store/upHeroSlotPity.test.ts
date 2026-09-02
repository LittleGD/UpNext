import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * 굴림틀 pity 영속화 — 상태 층위 계약.
 *
 * 스트릭은 `UpHeroState.slotBlankStreak` 에 살고 스토어 `resolveChoice` 가
 * 굴림마다 갱신한다. 세션(`CombatSession`)은 이 값을 갖지 않는다. 그래서:
 *  - 탐험을 넘어 이어진다 (탐험 A 꽝 2 + 탐험 B 꽝 2 = 4)
 *  - 4 에 닿은 뒤 첫 굴림은 반드시 보상, 보상 뒤 0
 *  - 굴림이 실제로 일어나지 않은 선택(건너가기·잔액 부족)은 건드리지 않는다
 *  - 레거시 저장본(필드 없음)은 0, 클라우드 왕복 키 "slotBlankStreak"
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore, pickPersisted } from "./useUpHeroStore";
import { normalizeUpHeroState } from "@/lib/sync";
import { createSession } from "@/lib/upHeroCombat";
import { resetRng } from "@/lib/upHeroRng";
import { SLOT_EVENT } from "@/data/flavor/slot";
import {
  SLOT_PITY_THRESHOLD,
  SLOT_BLANK_STREAK_MAX,
  SLOT_SPIN_COST,
} from "@/lib/upHeroSlot";
import { createDefaultHero, type CombatSession, type UpHeroState } from "@/types/uphero";

/** 원시 표에서 꽝(0..490)에 떨어지는 난수. pity 표(510)에서는 coinSmall. */
const ROLL_BLANK = 0.1;
/** 원시 표에서 coinSmall(490..684)에 떨어지는 난수. */
const ROLL_WIN = 0.6;

/** 굴림틀 choice 엔트리를 세션에 꽂고 대기 상태로 만든다. */
function armSlot(s: CombatSession): CombatSession {
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

function freshSession(coins = 1000): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.rewards.coins = coins;
  return s;
}

function lastSlotOutcome() {
  const s = useUpHeroStore.getState().currentSession;
  if (!s) return undefined;
  for (let i = s.log.length - 1; i >= 0; i -= 1) {
    const e = s.log[i];
    if (e.type === "choiceResult") return e.slot?.outcome;
  }
  return undefined;
}

/**
 * 현재 세션(없으면 새 세션)에 굴림틀을 꽂고 첫 난수를 `roll` 로 고정해 돌린다.
 * 굴림틀 선택지 0 은 outcomes 없이 effect 하나라 첫 Math.random 호출이 곧 롤이다.
 */
function spin(roll: number, session?: CombatSession) {
  const base = session ?? useUpHeroStore.getState().currentSession ?? freshSession();
  useUpHeroStore.setState({ currentSession: armSlot(base) });
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValueOnce(roll);
  spy.mockReturnValue(0.5);
  useUpHeroStore.getState().resolveChoice(0);
  spy.mockRestore();
  return lastSlotOutcome();
}

const streak = () => useUpHeroStore.getState().slotBlankStreak;

beforeEach(() => {
  resetRng();
  useUpHeroStore.setState({
    hero: createDefaultHero("ko"),
    coins: 0,
    currentSession: null,
    slotBlankStreak: 0,
    // 하루 굴림 상한(shopDaily.slotSpins)도 테스트마다 비운다 — 스트릭과는 별개 카운터.
    shopDaily: undefined,
    isLoaded: true,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("slotBlankStreak — 탐험을 넘어 유지", () => {
  it("꽝마다 +1 이고 새 탐험에서도 이어진다", () => {
    // 탐험 A — 꽝 2회 (하루 상한 3 안).
    expect(spin(ROLL_BLANK, freshSession())).toBe("blank");
    expect(streak()).toBe(1);
    expect(spin(ROLL_BLANK)).toBe("blank");
    expect(streak()).toBe(2);
    // 탐험 A 종료 — 세션이 사라져도 스트릭은 상태에 남는다.
    useUpHeroStore.setState({ currentSession: null });
    expect(streak()).toBe(2);
    // 다음 날 탐험 B — 하루 상한은 리셋되지만(shopDaily 롤오버) 스트릭은 날짜를
    //   넘어 이어진다. 꽝 2회 더. 세션 스코프였다면 여기서 0 부터 다시 셌을 것이다.
    useUpHeroStore.setState({ shopDaily: undefined });
    expect(spin(ROLL_BLANK, freshSession())).toBe("blank");
    expect(spin(ROLL_BLANK)).toBe("blank");
    expect(streak()).toBe(SLOT_PITY_THRESHOLD - 1);
  });

  it("세션 객체는 스트릭을 갖지 않는다 — 상태가 유일한 진실", () => {
    spin(ROLL_BLANK, freshSession());
    const s = useUpHeroStore.getState().currentSession as unknown as Record<string, unknown>;
    expect("slotBlankStreak" in s).toBe(false);
    expect(streak()).toBe(1);
  });
});

describe("slotBlankStreak — 5번째 보장 당첨과 리셋", () => {
  it("스트릭 4 에서는 꽝 난수도 보상이 된다 (표에서 blank 제외 재정규화)", () => {
    // 같은 난수가 스트릭 0 에서는 꽝임을 먼저 보인다.
    expect(spin(ROLL_BLANK, freshSession())).toBe("blank");
    useUpHeroStore.setState({ slotBlankStreak: SLOT_PITY_THRESHOLD - 1 });
    const out = spin(ROLL_BLANK, freshSession());
    expect(out).toBeDefined();
    expect(out).not.toBe("blank");
    expect(streak()).toBe(0);
  });

  it("스트릭 4 에서 어떤 난수를 넣어도 꽝은 나오지 않는다", () => {
    for (let i = 0; i < 200; i += 1) {
      // 하루 상한에 막히지 않게 매 회 오늘 카운터를 비운다 (검증 대상은 pity 표).
      useUpHeroStore.setState({ slotBlankStreak: SLOT_PITY_THRESHOLD - 1, shopDaily: undefined });
      const out = spin(i / 200, freshSession());
      expect(out).not.toBe("blank");
      expect(streak()).toBe(0);
    }
  });

  it("보상이 나오면 0 으로 돌아간다", () => {
    useUpHeroStore.setState({ slotBlankStreak: 2 });
    expect(spin(ROLL_WIN, freshSession())).toBe("coinSmall");
    expect(streak()).toBe(0);
  });

  it("스트릭 3 에서는 아직 꽝이 날 수 있다 — 보장은 정확히 5번째다", () => {
    useUpHeroStore.setState({ slotBlankStreak: SLOT_PITY_THRESHOLD - 2 });
    expect(spin(ROLL_BLANK, freshSession())).toBe("blank");
    expect(streak()).toBe(SLOT_PITY_THRESHOLD - 1);
  });
});

describe("slotBlankStreak — 굴림이 없으면 건드리지 않는다", () => {
  it("건너가기 선택은 스트릭 불변", () => {
    useUpHeroStore.setState({ slotBlankStreak: 3, currentSession: armSlot(freshSession()) });
    useUpHeroStore.getState().resolveChoice(1);
    expect(lastSlotOutcome()).toBeUndefined();
    expect(streak()).toBe(3);
  });

  it("잔액 부족으로 드럼이 안 돌면 스트릭 불변", () => {
    useUpHeroStore.setState({ slotBlankStreak: 3 });
    expect(spin(ROLL_BLANK, freshSession(SLOT_SPIN_COST - 1))).toBeUndefined();
    expect(streak()).toBe(3);
  });
});

describe("slotBlankStreak — 레거시 저장본과 클라우드 왕복", () => {
  it("필드가 없는 상태에서 굴려도 0 으로 읽혀 NaN 없이 1 이 된다", () => {
    useUpHeroStore.setState({ slotBlankStreak: undefined });
    expect(spin(ROLL_BLANK, freshSession())).toBe("blank");
    expect(streak()).toBe(1);
  });

  it("클라우드 문서에 키가 없으면 0 이고, 0 이어도 키를 남긴다", () => {
    const wire = normalizeUpHeroState({ coins: 500 });
    expect(wire.slotBlankStreak).toBe(0);
    expect(Object.keys(wire)).toContain("slotBlankStreak");
  });

  it("정상 값은 그대로 왕복하고 손상 값은 [0,1000] 정수로 접힌다", () => {
    expect(normalizeUpHeroState({ slotBlankStreak: 3 }).slotBlankStreak).toBe(3);
    expect(normalizeUpHeroState({ slotBlankStreak: -2 }).slotBlankStreak).toBe(0);
    expect(normalizeUpHeroState({ slotBlankStreak: 2.7 }).slotBlankStreak).toBe(2);
    expect(normalizeUpHeroState({ slotBlankStreak: 1e9 }).slotBlankStreak).toBe(
      SLOT_BLANK_STREAK_MAX,
    );
    expect(normalizeUpHeroState({ slotBlankStreak: "넷" }).slotBlankStreak).toBe(0);
  });

  it("_setFromCloud 는 빠진 필드를 0 으로, 정상 값은 그대로 받는다", () => {
    useUpHeroStore.setState({ slotBlankStreak: 4 });
    useUpHeroStore.getState()._setFromCloud({
      ...useUpHeroStore.getState(),
      slotBlankStreak: undefined,
    });
    expect(streak()).toBe(0);
    useUpHeroStore.getState()._setFromCloud({ ...useUpHeroStore.getState(), slotBlankStreak: 3 });
    expect(streak()).toBe(3);
  });

  it("로컬 persist → 와이어 → 복원 왕복 뒤에도 pity 가 그대로 발동한다", () => {
    useUpHeroStore.setState({ slotBlankStreak: SLOT_PITY_THRESHOLD - 1 });
    const persisted = pickPersisted(useUpHeroStore.getState() as UpHeroState);
    expect(persisted.slotBlankStreak).toBe(SLOT_PITY_THRESHOLD - 1);
    const wire = normalizeUpHeroState(persisted);
    expect(wire.slotBlankStreak).toBe(SLOT_PITY_THRESHOLD - 1);

    // 다른 기기가 이 문서를 받았다고 치고 스트릭을 지운 뒤 복원한다.
    useUpHeroStore.setState({ slotBlankStreak: 0 });
    useUpHeroStore.getState()._setFromCloud(wire);
    expect(streak()).toBe(SLOT_PITY_THRESHOLD - 1);
    expect(spin(ROLL_BLANK, freshSession())).not.toBe("blank");
    expect(streak()).toBe(0);
  });

  it("로그아웃 리셋은 스트릭도 0 으로 되돌린다", () => {
    useUpHeroStore.setState({ slotBlankStreak: 4 });
    useUpHeroStore.getState().resetForSignOut();
    expect(streak()).toBe(0);
  });
});
