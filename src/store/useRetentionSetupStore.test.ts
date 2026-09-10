import { beforeEach, describe, expect, it, vi } from "vitest";

const { android } = vi.hoisted(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  return { android: vi.fn(() => true) };
});
vi.mock("@/lib/platform", () => ({ isAndroidNative: android, isNative: () => false }));
vi.mock("@/lib/storage", () => ({ saveToStorage: vi.fn(), loadFromStorage: () => null }));
vi.mock("@/lib/notifications", () => ({
  scheduleChallengeReminder: vi.fn(), cancelChallengeReminder: vi.fn(),
  showChallengeStatus: vi.fn(), hideChallengeStatus: vi.fn(), showInstantNotify: vi.fn(),
  scheduleExtraNudge: vi.fn(), cancelExtraNudge: vi.fn(),
}));

import { useRetentionSetupStore as setup } from "./useRetentionSetupStore";
import { useGameStore } from "./useGameStore";
import { ALL_CARDS } from "@/data/cards";

beforeEach(() => {
  localStorage.clear();
  setup.setState({ queue: [], seen: [], manual: null, step: 0, time: null, awaitingExternal: null });
  android.mockReturnValue(true);
});

describe("device setup milestones", () => {
  it("queues first and second actual completions, including extra challenges, only once", () => {
    const first = ALL_CARDS.find(c => c.rarity === "normal")!;
    const second = ALL_CARDS.find(c => c.rarity === "normal" && c.id !== first.id)!;
    const game = useGameStore.getState();
    useGameStore.setState({ progress: { ...game.progress, xp: 0, level: 0, cardCompletions: {}, notificationsEnabled: false },
      daily: { ...game.daily, selectedCards: [first], completedIds: [], challengePhase: "daily" } });
    useGameStore.getState().completeChallenge(first.id);
    useGameStore.getState().completeChallenge(first.id);
    expect(setup.getState().queue).toEqual(["notifications"]);
    useGameStore.setState({ daily: { ...useGameStore.getState().daily, challengePhase: "extra", extraSelectedCards: [second], extraCompletedIds: [] } });
    useGameStore.getState().completePhaseChallenge(second.id);
    useGameStore.getState().completePhaseChallenge(second.id);
    expect(setup.getState().queue).toEqual(["notifications", "widget"]);
  });
  it("does not backfill existing users or show native flows on the web", () => {
    setup.getState().recordCompletion(50);
    android.mockReturnValue(false);
    setup.getState().recordCompletion(1);
    expect(setup.getState().queue).toEqual([]);
  });
  it("persists a settings handoff and widget practice across app restart", async () => {
    setup.getState().recordCompletion(1);
    setup.getState().draft({ time: "20:00", awaitingExternal: "notifications" });
    await setup.persist.rehydrate();
    expect(setup.getState()).toMatchObject({ queue: ["notifications"], time: "20:00", awaitingExternal: "notifications" });
    setup.getState().finish("notifications");
    setup.getState().recordCompletion(2);
    setup.getState().draft({ step: 2, awaitingExternal: "widget" });
    await setup.persist.rehydrate();
    expect(setup.getState()).toMatchObject({ queue: ["widget"], step: 2, awaitingExternal: "widget" });
  });
  it("skipping consumes only that prompt, and Settings can reopen it", () => {
    setup.getState().recordCompletion(1);
    setup.getState().recordCompletion(2);
    setup.getState().finish("notifications");
    setup.getState().recordCompletion(1);
    expect(setup.getState().queue).toEqual(["widget"]);
    setup.getState().finish("widget");
    setup.getState().open("notifications");
    expect(setup.getState()).toMatchObject({ queue: ["notifications"], manual: "notifications" });
  });
});
