import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Track I (피드백 13) — 풀 카드팩 큐 (pendingFullPacks) 계약.
 *
 * - 큐 소진 순서 full > bonus > levelUp: 유료 팩이 1장 보너스 뒤로 밀리지 않는다.
 * - 풀팩은 항상 5장, tier 는 rare 이상.
 * - 잠긴 카드가 부족하면 장당 160 코인으로 보상 (useUpHeroStore.addCoins).
 * - 컬렉션 100% 상태의 남은 풀팩은 800 코인 환급, 상점은 구매를 거절한다.
 *
 * 저장/알림은 관심사가 아니므로 모듈째 대체한다.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  scheduleChallengeReminder: vi.fn(),
  cancelChallengeReminder: vi.fn(),
  showChallengeStatus: vi.fn(),
  hideChallengeStatus: vi.fn(),
  showInstantNotify: vi.fn(),
  scheduleExtraNudge: vi.fn(),
  cancelExtraNudge: vi.fn(),
}));

import { useGameStore } from "./useGameStore";
import { useUpHeroStore } from "./useUpHeroStore";
import { loadFromStorage } from "@/lib/storage";
import { ALL_CARDS, STARTER_CARD_IDS } from "@/data/cards";
import { PACK_TIER_COUNT, FULL_PACK_CARD_COUNT } from "@/data/packTier";
import { SHOP_PRICES } from "@/types/uphero";
import type { UserProgress } from "@/types/game";

const ALL_IDS = ALL_CARDS.map((c) => c.id);

function seedProgress(overrides: Partial<UserProgress>) {
  const base = useGameStore.getState().progress;
  useGameStore.setState({
    progress: {
      ...base,
      unlockedCardIds: [...STARTER_CARD_IDS],
      pendingPacks: 0,
      pendingBonusCards: 0,
      pendingFullPacks: 0,
      collectionCompletedAt: null,
      xp: 0,
      level: 0,
      ...overrides,
    },
    isOpeningPack: false,
  });
}

function queues() {
  const p = useGameStore.getState().progress;
  return [p.pendingFullPacks, p.pendingBonusCards, p.pendingPacks];
}

beforeEach(() => {
  useUpHeroStore.setState({ coins: 0, isLoaded: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openCardPack — 큐 순서 full > bonus > levelUp", () => {
  it("풀팩 5장(rare+) → 보너스 1장 → 레벨업 팩 → 빈 결과", () => {
    seedProgress({ pendingFullPacks: 1, pendingBonusCards: 1, pendingPacks: 1 });
    const open = useGameStore.getState().openCardPack;

    const first = open();
    expect(first.kind).toBe("full");
    expect(first.cards).toHaveLength(FULL_PACK_CARD_COUNT);
    expect(["rare", "unique", "legend"]).toContain(first.tier);
    expect(first.shortfall).toBe(0);
    expect(first.shortfallCoins).toBe(0);
    expect(queues()).toEqual([0, 1, 1]);

    const second = open();
    expect(second.kind).toBe("bonus");
    expect(second.cards).toHaveLength(1);
    expect(queues()).toEqual([0, 0, 1]);

    const third = open();
    expect(third.kind).toBe("levelUp");
    expect(third.cards).toHaveLength(PACK_TIER_COUNT[third.tier]);
    expect(queues()).toEqual([0, 0, 0]);

    const fourth = open();
    expect(fourth.cards).toEqual([]);
    expect(fourth.kind).toBe("levelUp");
  });

  it("뽑힌 카드는 모두 unlockedCardIds 에 추가된다", () => {
    seedProgress({ pendingFullPacks: 1 });
    const before = useGameStore.getState().progress.unlockedCardIds.length;
    const res = useGameStore.getState().openCardPack();
    const after = useGameStore.getState().progress.unlockedCardIds;
    expect(after.length).toBe(before + res.cards.length);
    for (const c of res.cards) expect(after).toContain(c.id);
  });
});

describe("openCardPack — 부족분 보상", () => {
  it("잠긴 카드 2장 + 풀팩 1 → 2장, shortfall 3, 480 코인", () => {
    seedProgress({ unlockedCardIds: ALL_IDS.slice(0, -2), pendingFullPacks: 1 });
    useUpHeroStore.setState({ coins: 100 });
    const res = useGameStore.getState().openCardPack();
    expect(res.kind).toBe("full");
    expect(res.cards).toHaveLength(2);
    expect(res.shortfall).toBe(3);
    expect(res.shortfallCoins).toBe(480);
    // 첫 컬렉션 완료 보너스(2000) 도 이 순간 같이 들어온다 — 부족분 480 은 그 위에 얹힌다.
    expect(useUpHeroStore.getState().coins).toBe(100 + 480 + 2000);
    expect(useGameStore.getState().progress.pendingFullPacks).toBe(0);
    expect(useGameStore.getState().progress.unlockedCardIds).toHaveLength(ALL_IDS.length);
  });

  it("이미 완료 이력이 있으면 부족분 코인만 들어온다", () => {
    seedProgress({
      unlockedCardIds: ALL_IDS.slice(0, -1),
      pendingFullPacks: 1,
      collectionCompletedAt: "2026-01-01T00:00:00.000Z",
    });
    useUpHeroStore.setState({ coins: 0 });
    const res = useGameStore.getState().openCardPack();
    expect(res.cards).toHaveLength(1);
    expect(res.shortfall).toBe(4);
    expect(res.shortfallCoins).toBe(640);
    expect(useUpHeroStore.getState().coins).toBe(640);
  });
});

describe("openCardPack — 컬렉션 100% 분기", () => {
  it("남은 풀팩 2개 → 카드 없음, 1600 코인 환급, 큐 0", () => {
    seedProgress({
      unlockedCardIds: [...ALL_IDS],
      pendingFullPacks: 2,
      collectionCompletedAt: "2026-01-01T00:00:00.000Z",
    });
    useUpHeroStore.setState({ coins: 0 });
    const res = useGameStore.getState().openCardPack();
    expect(res.cards).toEqual([]);
    expect(useUpHeroStore.getState().coins).toBe(1600);
    expect(useGameStore.getState().progress.pendingFullPacks).toBe(0);
  });
});

describe("initialize / purchaseCardPack", () => {
  it("저장된 progress 에 pendingFullPacks 1 이면 initialize 뒤 isOpeningPack", () => {
    const saved = {
      ...useGameStore.getState().progress,
      unlockedCardIds: [...STARTER_CARD_IDS],
      pendingPacks: 0,
      pendingBonusCards: 0,
      pendingFullPacks: 1,
    };
    vi.mocked(loadFromStorage).mockImplementation((key: string) =>
      key === "progress" ? (saved as unknown as null) : null,
    );
    useGameStore.setState({ isLoaded: false, isOpeningPack: false });
    useGameStore.getState().initialize();
    expect(useGameStore.getState().isOpeningPack).toBe(true);
    expect(useGameStore.getState().progress.pendingFullPacks).toBe(1);
    vi.mocked(loadFromStorage).mockImplementation(() => null);
  });

  it("purchaseCardPack('full') → pendingFullPacks +1, pendingPacks 불변, 코인 -800, isOpeningPack", () => {
    seedProgress({ pendingPacks: 0 });
    useUpHeroStore.setState({ coins: 1000 });
    const ok = useUpHeroStore.getState().purchaseCardPack("full");
    expect(ok).toBe(true);
    const p = useGameStore.getState().progress;
    expect(p.pendingFullPacks).toBe(1);
    expect(p.pendingPacks).toBe(0);
    expect(useUpHeroStore.getState().coins).toBe(1000 - SHOP_PRICES.cardPackFull);
    expect(useGameStore.getState().isOpeningPack).toBe(true);
  });

  it("컬렉션 완료 상태에서는 두 팩 모두 구매 거절, 코인 불변", () => {
    seedProgress({ unlockedCardIds: [...ALL_IDS] });
    useUpHeroStore.setState({ coins: 5000 });
    expect(useUpHeroStore.getState().purchaseCardPack("full")).toBe(false);
    expect(useUpHeroStore.getState().purchaseCardPack("small")).toBe(false);
    expect(useUpHeroStore.getState().coins).toBe(5000);
    expect(useGameStore.getState().progress.pendingFullPacks).toBe(0);
    expect(useGameStore.getState().progress.pendingBonusCards).toBe(0);
  });

  it("코인 부족이면 거절", () => {
    seedProgress({});
    useUpHeroStore.setState({ coins: 100 });
    expect(useUpHeroStore.getState().purchaseCardPack("full")).toBe(false);
    expect(useUpHeroStore.getState().coins).toBe(100);
  });
});
