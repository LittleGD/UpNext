import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Track I (피드백 3) — 챌린지 완료 결과 반환 (ChallengeCompletionResult).
 *
 * 셀레브레이션이 "실제로 progress.xp 에 더해진 값" 을 보여주려면 store 가
 * 결과를 돌려줘야 한다. 컬렉션 100% 완료자의 환산 보상 XP(굴림값) 는 반환값으로만
 * 알 수 있다. totalXp === progress.xp 증가분 이 이 테스트의 핵심 불변식.
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
import { ALL_CARDS, STARTER_CARD_IDS } from "@/data/cards";
import { totalXPForLevel, XP_PER_RARITY } from "@/types/game";
import { COLLECTION_COMPENSATION_BONUS } from "@/data/packTier";
import type { ChallengePhase, UserProgress } from "@/types/game";
import type { ChallengeCard } from "@/types/card";

const ALL_IDS = ALL_CARDS.map((c) => c.id);
const NORMAL_CARD = ALL_CARDS.find((c) => c.rarity === "normal") as ChallengeCard;

function seed(
  phase: ChallengePhase,
  card: ChallengeCard,
  progressOverrides: Partial<UserProgress> = {},
) {
  const s = useGameStore.getState();
  const daily = {
    ...s.daily,
    challengePhase: phase,
    selectedCards: phase === "daily" ? [card] : [],
    completedIds: [],
    extraSelectedCards: phase === "extra" ? [card] : [],
    extraCompletedIds: [],
    superSelectedCards: phase === "super" ? [card] : [],
    superCompletedIds: [],
  };
  useGameStore.setState({
    daily,
    progress: {
      ...s.progress,
      unlockedCardIds: [...STARTER_CARD_IDS],
      pendingPacks: 0,
      pendingBonusCards: 0,
      pendingFullPacks: 0,
      xp: 0,
      level: 0,
      tickets: 0,
      notificationsEnabled: false,
      ...progressOverrides,
    },
    isOpeningPack: false,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  useUpHeroStore.setState({ coins: 0, isLoaded: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("completeChallenge — 결과 반환", () => {
  it("normal 카드: {10, 0, 10, 0} 이고 progress.xp 도 10 늘어난다", () => {
    seed("daily", NORMAL_CARD);
    const before = useGameStore.getState().progress.xp;
    const res = useGameStore.getState().completeChallenge(NORMAL_CARD.id);
    expect(res).toEqual({ baseXp: 10, bonusXp: 0, totalXp: 10, levelsGained: 0 });
    expect(useGameStore.getState().progress.xp - before).toBe(10);
  });

  it("같은 카드를 두 번 완료하면 두 번째는 null", () => {
    seed("daily", NORMAL_CARD);
    useGameStore.getState().completeChallenge(NORMAL_CARD.id);
    vi.advanceTimersByTime(200);
    expect(useGameStore.getState().completeChallenge(NORMAL_CARD.id)).toBeNull();
  });

  it("컬렉션 100% 완료자가 레벨을 넘기면 bonusXp(환산 굴림) 가 반환값과 xp 증가분에 같이 들어간다", () => {
    const level = 3;
    seed("daily", NORMAL_CARD, {
      unlockedCardIds: [...ALL_IDS],
      level,
      xp: totalXPForLevel(level + 1) - 5,
    });
    const before = useGameStore.getState().progress.xp;
    const res = useGameStore.getState().completeChallenge(NORMAL_CARD.id);
    expect(res).not.toBeNull();
    expect(res!.levelsGained).toBe(1);
    expect(res!.baseXp).toBe(XP_PER_RARITY.normal);
    expect([50, 100, 200, 500]).toContain(res!.bonusXp);
    expect(res!.totalXp).toBe(res!.baseXp + res!.bonusXp);
    expect(useGameStore.getState().progress.xp - before).toBe(res!.totalXp);
    // 완료자는 pendingPacks 를 쌓지 않는다 (환산 보상으로 대체).
    expect(useGameStore.getState().progress.pendingPacks).toBe(0);
  });

  it("미완료자가 레벨을 넘기면 bonusXp 0, pendingPacks +1", () => {
    const level = 2;
    seed("daily", NORMAL_CARD, { level, xp: totalXPForLevel(level + 1) - 5 });
    const res = useGameStore.getState().completeChallenge(NORMAL_CARD.id);
    expect(res).toEqual({ baseXp: 10, bonusXp: 0, totalXp: 10, levelsGained: 1 });
    expect(useGameStore.getState().progress.pendingPacks).toBe(1);
  });
});

describe("completePhaseChallenge — 결과 반환", () => {
  it("extra 1장 풀클리어 + 컬렉션 완료 → bonusXp 에 25(COLLECTION_COMPENSATION_BONUS) 포함, totalXp === 증가분", () => {
    seed("extra", NORMAL_CARD, { unlockedCardIds: [...ALL_IDS] });
    const before = useGameStore.getState().progress.xp;
    const res = useGameStore.getState().completePhaseChallenge(NORMAL_CARD.id);
    expect(res).not.toBeNull();
    expect(res!.baseXp).toBe(10);
    expect(res!.bonusXp).toBe(COLLECTION_COMPENSATION_BONUS.xp);
    expect(res!.totalXp).toBe(10 + COLLECTION_COMPENSATION_BONUS.xp);
    expect(useGameStore.getState().progress.xp - before).toBe(res!.totalXp);
    expect(useUpHeroStore.getState().coins).toBe(COLLECTION_COMPENSATION_BONUS.coins);
  });

  it("extra 미완료자: bonusXp 0, 보너스 카드 큐 +1", () => {
    seed("extra", NORMAL_CARD);
    const res = useGameStore.getState().completePhaseChallenge(NORMAL_CARD.id);
    expect(res).toEqual({ baseXp: 10, bonusXp: 0, totalXp: 10, levelsGained: 0 });
    expect(useGameStore.getState().progress.pendingBonusCards).toBe(1);
  });

  it("daily phase 는 completeChallenge 로 위임해 같은 모양을 돌려준다", () => {
    seed("daily", NORMAL_CARD);
    const res = useGameStore.getState().completePhaseChallenge(NORMAL_CARD.id);
    expect(res).toEqual({ baseXp: 10, bonusXp: 0, totalXp: 10, levelsGained: 0 });
    expect(useGameStore.getState().daily.completedIds).toContain(NORMAL_CARD.id);
  });

  it("이미 완료한 카드는 null", () => {
    seed("extra", NORMAL_CARD);
    useGameStore.getState().completePhaseChallenge(NORMAL_CARD.id);
    expect(useGameStore.getState().completePhaseChallenge(NORMAL_CARD.id)).toBeNull();
  });
});
