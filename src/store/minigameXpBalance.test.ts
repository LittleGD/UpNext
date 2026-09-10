import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(), loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(), clearAllAppStorage: vi.fn(),
}));
vi.mock("@/lib/sounds", () => ({ playSound: vi.fn(), triggerHaptic: vi.fn() }));

import { useGameStore } from "./useGameStore";
import { useMinigameStore } from "./useMinigameStore";
import { ALL_CARDS } from "@/data/cards";
import { totalXPForLevel, XP_PER_RARITY } from "@/types/game";
import type { MinigameTile } from "@/types/minigame";

const cards = ["normal", "rare", "unique", "legend"].map(
  rarity => ALL_CARDS.find(card => card.rarity === rarity)!,
);
const tiles: MinigameTile[] = cards.map(card => ({
  tileId: card.id, pairKey: card.id, kind: "challenge", card,
  isFaceUp: true, isMatched: true,
}));

beforeEach(() => {
  useGameStore.setState({
    progress: { ...useGameStore.getState().progress,
      level: 1, xp: totalXPForLevel(1), pendingPacks: 0,
      unlockedCardIds: cards.map(card => card.id), cardCompletions: {},
      minigameRunsPlayed: 0, minigameBestMatches: 0,
    },
  });
  useMinigameStore.setState({
    phase: "runResult", roundsCleared: 3, matchedAllRun: tiles,
    doubleLootActive: true, duplicateStashActive: false, xpBoostTileIds: [],
    runStats: { ...useMinigameStore.getState().runStats, totalMatches: 4 },
  });
});

describe("card match XP balance", () => {
  it("grants the reduced rarity rewards without changing challenge XP", () => {
    useMinigameStore.getState().pickRunReward(tiles.map(tile => tile.tileId));
    expect(useGameStore.getState().progress.xp).toBe(156); // 100 + 3 + 8 + 15 + 30
    expect(XP_PER_RARITY).toEqual({ normal: 10, rare: 25, unique: 50, legend: 100 });
  });

  it("caps stacked buffs at 100 XP and cannot claim the run twice", () => {
    useMinigameStore.setState({
      duplicateStashActive: true, xpBoostTileIds: tiles.map(tile => tile.tileId),
    });
    useMinigameStore.getState().pickRunReward(tiles.map(tile => tile.tileId));
    expect(useGameStore.getState().progress.xp).toBe(200);
    expect(useGameStore.getState().progress.level).toBe(1);
    useMinigameStore.getState().pickRunReward(tiles.map(tile => tile.tileId));
    expect(useGameStore.getState().progress.xp).toBe(200);
    expect(useGameStore.getState().progress.minigameRunsPlayed).toBe(1);
  });

  it("unlocks new cards without adding XP or challenge completions", () => {
    useGameStore.setState({ progress: { ...useGameStore.getState().progress, unlockedCardIds: [] } });
    useMinigameStore.getState().pickRunReward(tiles.map(tile => tile.tileId));
    const p = useGameStore.getState().progress;
    expect(p.unlockedCardIds).toEqual(cards.map(card => card.id));
    expect(p.xp).toBe(100);
    expect(p.cardCompletions).toEqual({});
  });

  it("still levels up at the existing boundary and preserves earned XP", () => {
    useGameStore.setState({ progress: { ...useGameStore.getState().progress, xp: 230 } });
    useMinigameStore.getState().pickRunReward([tiles[3].tileId]);
    const p = useGameStore.getState().progress;
    expect(p.xp).toBe(260);
    expect(p.level).toBe(2);
    expect(p.pendingPacks).toBe(1);
  });
});
