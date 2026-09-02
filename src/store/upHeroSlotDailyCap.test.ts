import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * 굴림틀 **하루 상한** — 상태 층위 계약.
 *
 * 카운터는 `UpHeroState.shopDaily.slotSpins` 에 산다 (탐험권·코인 주머니와 같은 날짜
 * 키, 새벽 1시 경계). 세션(`CombatSession`)은 카운터를 갖지 않는다. 그래서:
 *  - 같은 날 두 탐험에 걸쳐 합산 3 에서 막힌다 (탐험 1회당 3회가 아니다)
 *  - 날짜가 바뀌면 다른 shopDaily 필드와 함께 0 으로 리셋
 *  - "한 번 더"(spinSlotAgain)도 같은 카운터를 올린다
 *  - 상한에 닿은 날은 굴림틀 이벤트가 후보에서 빠진다 (tickSession 게이트)
 *  - 클라우드 왕복(와이어 키 "slotSpins", 정수 0..100, 항상 인코드)
 *  - 레거시 저장본(shopDaily.slotSpins 없음) = 0
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import {
  useUpHeroStore,
  pickPersisted,
  slotSpinsToday,
  slotSpinsLeft,
  currentShopDaily,
} from "./useUpHeroStore";
import { getTodayString } from "./useGameStore";
import { normalizeUpHeroState, encodeUpHeroForCloud } from "@/lib/sync";
import { createSession, tickSession } from "@/lib/upHeroCombat";
import { resetRng, setRngSeed } from "@/lib/upHeroRng";
import { SLOT_EVENT, isSlotEvent } from "@/data/flavor/slot";
import {
  SLOT_DAILY_SPIN_CAP,
  SLOT_SPIN_COST,
  SLOT_SPINS_WIRE_MAX,
  normalizeSlotSpins,
} from "@/lib/upHeroSlot";
import { createDefaultHero, type CombatSession, type UpHeroState } from "@/types/uphero";

/** 원시 표에서 꽝(0..490)에 떨어지는 난수. */
const ROLL_BLANK = 0.1;

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

function freshSession(coins = 10_000): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.rewards.coins = coins;
  s.status = "active";
  return s;
}

/** 현재 세션(없으면 새 세션)에 굴림틀을 꽂고 해소한다. 굴렸으면 결과 id, 막혔으면 undefined. */
function spin(session?: CombatSession) {
  const base = session ?? useUpHeroStore.getState().currentSession ?? freshSession();
  useUpHeroStore.setState({ currentSession: armSlot(base) });
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValueOnce(ROLL_BLANK);
  spy.mockReturnValue(0.5);
  useUpHeroStore.getState().resolveChoice(0);
  spy.mockRestore();
  const s = useUpHeroStore.getState().currentSession;
  for (let i = (s?.log.length ?? 0) - 1; i >= 0; i -= 1) {
    const e = s!.log[i];
    if (e.type === "choiceResult") return e.slot?.outcome;
  }
  return undefined;
}

const today = () => slotSpinsToday(useUpHeroStore.getState().shopDaily);
const daily = () => useUpHeroStore.getState().shopDaily;

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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shopDaily.slotSpins — 같은 날 탐험을 넘어 합산", () => {
  it("탐험 A 2회 + 탐험 B 1회 = 3 에서 막히고, 세션은 카운터를 갖지 않는다", () => {
    // 탐험 A — 2회.
    expect(spin(freshSession())).toBeDefined();
    expect(spin()).toBeDefined();
    expect(today()).toBe(2);
    expect("slotSpins" in useUpHeroStore.getState().currentSession!).toBe(false);
    // 탐험 A 종료. 세션이 사라져도 오늘 카운터는 상태에 남는다.
    useUpHeroStore.setState({ currentSession: null });
    expect(today()).toBe(2);
    // 탐험 B — 세 번째는 돌고, 네 번째는 드럼이 꿈쩍하지 않는다.
    expect(spin(freshSession())).toBeDefined();
    expect(today()).toBe(SLOT_DAILY_SPIN_CAP);
    expect(slotSpinsLeft(daily())).toBe(0);
    const coinsBefore = useUpHeroStore.getState().currentSession!.rewards.coins;
    expect(spin()).toBeUndefined();
    expect(today()).toBe(SLOT_DAILY_SPIN_CAP);
    expect(useUpHeroStore.getState().currentSession!.rewards.coins).toBe(coinsBefore);
  });

  it("카운터는 shopDaily 의 다른 필드(passesBought·coinPouchClaimed)를 보존한다", () => {
    useUpHeroStore.setState({
      shopDaily: { date: getTodayString(), passesBought: 1, coinPouchClaimed: true },
    });
    spin(freshSession());
    expect(daily()).toEqual({
      date: getTodayString(),
      passesBought: 1,
      coinPouchClaimed: true,
      slotSpins: 1,
    });
  });

  it("막힌 굴림은 pity 스트릭도 건드리지 않는다", () => {
    useUpHeroStore.setState({
      shopDaily: { date: getTodayString(), passesBought: 0, slotSpins: SLOT_DAILY_SPIN_CAP },
      slotBlankStreak: 2,
    });
    expect(spin(freshSession())).toBeUndefined();
    expect(useUpHeroStore.getState().slotBlankStreak).toBe(2);
  });
});

describe("shopDaily.slotSpins — 날짜가 바뀌면 리셋", () => {
  it("어제 날짜의 카운터는 0 으로 읽히고, 굴리면 오늘 날짜로 새로 쓴다", () => {
    useUpHeroStore.setState({
      shopDaily: { date: "2000-01-01", passesBought: 2, slotSpins: SLOT_DAILY_SPIN_CAP },
    });
    expect(today()).toBe(0);
    expect(slotSpinsLeft(daily())).toBe(SLOT_DAILY_SPIN_CAP);
    expect(spin(freshSession())).toBeDefined();
    expect(daily()).toEqual({ date: getTodayString(), passesBought: 0, slotSpins: 1 });
  });

  it("시계를 다음 날로 돌리면 같은 상태에서 다시 3회가 열린다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 1, 12, 0, 0));
    for (let i = 0; i < SLOT_DAILY_SPIN_CAP; i += 1) expect(spin(freshSession())).toBeDefined();
    expect(spin()).toBeUndefined();
    // 다음 날 정오.
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0));
    expect(today()).toBe(0);
    expect(spin(freshSession())).toBeDefined();
    expect(today()).toBe(1);
  });

  it("initialize 는 오늘 날짜의 저장본이면 카운터를 살리고, 지난 날짜면 비운다", () => {
    const base = currentShopDaily(undefined);
    expect(base.slotSpins).toBeUndefined();
    expect(currentShopDaily({ date: "2000-01-01", passesBought: 1, slotSpins: 3 })).toEqual({
      date: getTodayString(),
      passesBought: 0,
    });
    const same = { date: getTodayString(), passesBought: 1, slotSpins: 2 };
    expect(currentShopDaily(same)).toBe(same);
  });
});

describe("shopDaily.slotSpins — 이벤트 등장 게이트", () => {
  it("상한에 닿은 날은 tickSession 이 굴림틀 이벤트를 뽑지 않는다", () => {
    // 굴림틀이 뽑힐 수 있는 조건(런 수입 ≥ 비용)을 만들고 여러 시드로 틱을 돌린다.
    let sawSlotWithoutCap = false;
    for (let seed = 1; seed <= 400; seed += 1) {
      setRngSeed(seed);
      const s = freshSession(SLOT_SPIN_COST * 10);
      const withCap = tickSession(s, { slotSpinsToday: SLOT_DAILY_SPIN_CAP });
      const last = withCap.log[withCap.log.length - 1];
      if (last?.type === "choice" && isSlotEvent(last)) {
        throw new Error(`seed ${seed}: 상한인데 굴림틀이 뽑혔다`);
      }
      setRngSeed(seed);
      const open = tickSession(s, { slotSpinsToday: 0 });
      const lastOpen = open.log[open.log.length - 1];
      if (lastOpen?.type === "choice" && isSlotEvent(lastOpen)) sawSlotWithoutCap = true;
    }
    // 같은 시드 집합에서 상한이 없으면 굴림틀이 실제로 뽑힌다 — 게이트가 살아 있다는 대조군.
    expect(sawSlotWithoutCap).toBe(true);
  });
});

describe("shopDaily.slotSpins — 레거시 저장본과 클라우드 왕복", () => {
  it("필드가 없는 저장본은 0 이고 NaN 없이 1 이 된다", () => {
    useUpHeroStore.setState({ shopDaily: { date: getTodayString(), passesBought: 0 } });
    expect(today()).toBe(0);
    expect(spin(freshSession())).toBeDefined();
    expect(today()).toBe(1);
  });

  it("normalizeSlotSpins 는 정수 [0, SLOT_SPINS_WIRE_MAX] 로 접는다", () => {
    expect(normalizeSlotSpins(undefined)).toBe(0);
    expect(normalizeSlotSpins(2)).toBe(2);
    expect(normalizeSlotSpins(-1)).toBe(0);
    expect(normalizeSlotSpins(2.9)).toBe(2);
    expect(normalizeSlotSpins(1e9)).toBe(SLOT_SPINS_WIRE_MAX);
    expect(normalizeSlotSpins("셋")).toBe(0);
    expect(normalizeSlotSpins(Number.NaN)).toBe(0);
  });

  it("클라우드 문서의 shopDaily 에 slotSpins 가 없으면 0 으로 채우고 키를 남긴다", () => {
    const wire = normalizeUpHeroState({
      shopDaily: { date: "2026-09-01", passesBought: 1 },
    });
    expect(wire.shopDaily).toEqual({ date: "2026-09-01", passesBought: 1, slotSpins: 0 });
  });

  it("정상 값은 그대로 왕복하고 손상 값은 교정된다", () => {
    expect(
      normalizeUpHeroState({ shopDaily: { date: "2026-09-01", passesBought: 0, slotSpins: 2 } })
        .shopDaily?.slotSpins,
    ).toBe(2);
    expect(
      normalizeUpHeroState({ shopDaily: { date: "2026-09-01", passesBought: 0, slotSpins: -4 } })
        .shopDaily?.slotSpins,
    ).toBe(0);
    expect(
      normalizeUpHeroState({ shopDaily: { date: "2026-09-01", passesBought: 0, slotSpins: 1e6 } })
        .shopDaily?.slotSpins,
    ).toBe(SLOT_SPINS_WIRE_MAX);
  });

  it("인코드는 slotSpins 를 항상 실어 어제 값이 merge 로 되살아나지 않게 한다", () => {
    const payload = encodeUpHeroForCloud({
      shopDaily: { date: "2026-09-01", passesBought: 0 },
    });
    expect(payload.shopDaily).toEqual({
      date: "2026-09-01",
      passesBought: 0,
      coinPouchClaimed: false,
      slotSpins: 0,
    });
    const withSpins = encodeUpHeroForCloud({
      shopDaily: { date: "2026-09-01", passesBought: 0, slotSpins: 2 },
    });
    expect((withSpins.shopDaily as { slotSpins: number }).slotSpins).toBe(2);
  });

  it("로컬 persist → 와이어 → 복원 왕복 뒤에도 오늘 카운터가 그대로 막는다", () => {
    useUpHeroStore.setState({
      shopDaily: { date: getTodayString(), passesBought: 0, slotSpins: SLOT_DAILY_SPIN_CAP },
    });
    const persisted = pickPersisted(useUpHeroStore.getState() as UpHeroState);
    expect(persisted.shopDaily?.slotSpins).toBe(SLOT_DAILY_SPIN_CAP);
    const wire = normalizeUpHeroState(encodeUpHeroForCloud(persisted));
    expect(wire.shopDaily?.slotSpins).toBe(SLOT_DAILY_SPIN_CAP);

    // 다른 기기가 이 문서를 받았다고 치고 카운터를 지운 뒤 복원한다.
    useUpHeroStore.setState({ shopDaily: undefined });
    useUpHeroStore.getState()._setFromCloud(wire);
    expect(today()).toBe(SLOT_DAILY_SPIN_CAP);
    expect(spin(freshSession())).toBeUndefined();
  });
});
