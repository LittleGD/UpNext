import { describe, it, expect } from "vitest";
import {
  totalXPForLevel,
  getLevelFromXP,
  getXPProgress,
  normalizeProgressXpLevel,
} from "./game";
import type { UserProgress } from "./game";

/**
 * 2026.04.18 hotfix 회귀 테스트 — XP 음수 bug (-484/340 유저 제보).
 *
 * 유발 상황: 구-XP 커브 (level*(50+10L)) 기준으로 저장된 cloud snapshot 이
 *   새-커브 (level*(80+20L)) 로 복원될 때 normalizeProgressXpLevel 없이
 *   _setFromCloud 가 raw 데이터를 덮어쓰면 floor 이하 xp 로 UI 에 음수 노출.
 */

function makeProgress(partial: Partial<UserProgress>): UserProgress {
  return {
    currentStreak: 0,
    longestStreak: 0,
    totalDaysCompleted: 0,
    unlockedCardIds: [],
    completionHistory: [],
    categoryCompletions: {
      fitness: 0,
      nutrition: 0,
      mindfulness: 0,
      learning: 0,
      social: 0,
      productivity: 0,
      wellness: 0,
      trending: 0,
    },
    mode: "normal",
    level: 0,
    xp: 0,
    daysTowardNextLevel: 0,
    pendingPacks: 0,
    pendingBonusCards: 0,
    pendingFullPacks: 0,
    cardCompletions: {},
    extraChallengesCompleted: 0,
    superChallengesCompleted: 0,
    equippedTitleId: null,
    seenTitleIds: [],
    hasPendingPenalty: false,
    language: "ko",
    soundEnabled: true,
    hapticEnabled: true,
    notificationsEnabled: false,
    notificationTime: "09:00",
    tickets: 0,
    minigameRunsPlayed: 0,
    minigameBestMatches: 0,
    ...partial,
  };
}

describe("XP curve math (post-f5c15fa)", () => {
  it("totalXPForLevel 새 커브 값 — Lv.6 = 1200", () => {
    expect(totalXPForLevel(0)).toBe(0);
    expect(totalXPForLevel(1)).toBe(100);
    expect(totalXPForLevel(6)).toBe(1200); // 6 * (80 + 120)
    expect(totalXPForLevel(7)).toBe(1540);
  });

  it("getXPProgress current 는 음수가 나오지 않는다 (defensive clamp)", () => {
    // 구-커브 기준 Lv.6 유저가 716 xp 로 들어와도 UI 에는 0 이 보여야 함
    const { current, needed } = getXPProgress(716, 6);
    expect(current).toBe(0);
    expect(needed).toBe(340);
  });

  it("getXPProgress 정상 경로 — current = xp − floor", () => {
    const { current, needed } = getXPProgress(1500, 6);
    expect(current).toBe(300);
    expect(needed).toBe(340);
  });
});

describe("normalizeProgressXpLevel", () => {
  it("버그 재현 시나리오 — Lv.6 xp=716 (구-커브 legit) → xp 를 1200 으로 끌어올림", () => {
    const input = makeProgress({ level: 6, xp: 716, pendingPacks: 0 });
    const { progress, levelsGained } = normalizeProgressXpLevel(input);
    expect(progress.xp).toBe(1200); // Lv.6 floor
    expect(progress.level).toBe(6); // 강등 없음 (grandfather)
    expect(progress.pendingPacks).toBe(0); // 레벨 변화 없으니 팩도 없음
    expect(levelsGained).toBe(0);
  });

  it("xp 가 다음 임계치 이상이면 level 승급 + pendingPacks 적립", () => {
    // Lv.5 유저가 xp 1500 (Lv.6 floor 1200 초과) 으로 들어오면 Lv.6 승급
    const input = makeProgress({ level: 5, xp: 1500, pendingPacks: 2 });
    const { progress, levelsGained } = normalizeProgressXpLevel(input);
    expect(progress.level).toBe(6);
    expect(progress.xp).toBe(1500); // 승급 후 xp 유지
    expect(progress.pendingPacks).toBe(3); // 기존 2 + 신규 1
    expect(levelsGained).toBe(1);
  });

  it("음수 xp 는 0 으로 클램프", () => {
    const input = makeProgress({ level: 0, xp: -500 });
    const { progress } = normalizeProgressXpLevel(input);
    expect(progress.xp).toBe(0);
  });

  it("정상 상태에서는 객체를 재생성하지 않음 (identity 유지, idempotent)", () => {
    const input = makeProgress({ level: 6, xp: 1500 });
    const result1 = normalizeProgressXpLevel(input);
    const result2 = normalizeProgressXpLevel(result1.progress);
    expect(result1.progress).toBe(input); // 변경 없으면 같은 레퍼런스
    expect(result2.progress).toBe(result1.progress); // 2차 호출도 노-옵
    expect(result1.levelsGained).toBe(0);
    expect(result2.levelsGained).toBe(0);
  });

  it("여러 레벨 동시 승급도 pendingPacks 에 누적", () => {
    // Lv.2 에 xp 2000 (Lv.7 floor=1540 초과) → 5 level jump
    const input = makeProgress({ level: 2, xp: 2000, pendingPacks: 0 });
    const { progress, levelsGained } = normalizeProgressXpLevel(input);
    expect(progress.level).toBe(getLevelFromXP(2000));
    expect(levelsGained).toBe(progress.level - 2);
    expect(progress.pendingPacks).toBe(levelsGained);
  });
});
