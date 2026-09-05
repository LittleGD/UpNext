import { describe, it, expect } from "vitest";
import {
  WEEKLY_ALL_CLEAR_COINS,
  WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
  WEEKLY_ALL_CLEAR_DOWN_GUARDS,
  WEEKLY_DUNGEON_COUNT,
  WEEKLY_FIRST_CLEAR_COINS,
  WEEKLY_FIRST_CLEAR_DESTROY_GUARDS,
  calculateBossesDefeated,
  calculateDungeonProgress,
  computeWeeklyClearReward,
  resolveStartFloor,
} from "./sessionReward";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { createMonsterForFloor } from "@/data/upHeroMonsters";
import { createDefaultHero, type CombatSession, type DungeonId, type LogEntry, type SessionEndReason } from "@/types/uphero";

/**
 * Phase 16 (Track C) — 정산 순수 함수 회귀 테스트.
 *   Track E 가 calculateCodexDelta / splitDropsByCap describe 를 여기에 덧붙인다.
 */

function makeSession(
  dungeonId: DungeonId,
  currentFloor: number,
  log: LogEntry[],
  extra: Partial<CombatSession> = {},
): CombatSession {
  return {
    dungeonId,
    startFloor: 1,
    currentFloor,
    log,
    hero: createDefaultHero("ko"),
    rewards: { xp: 0, coins: 0, drops: [] },
    status: "completed",
    speed: 1,
    time: 0,
    maxTime: 220,
    startedAt: 0,
    ...extra,
  };
}

function bossVictory(dungeonId: DungeonId, floor: number): LogEntry[] {
  const boss = createMonsterForFloor(dungeonId, floor, true);
  return [
    { type: "boss", monster: boss, floor, timestamp: 0 },
    { type: "encounter", monster: boss, timestamp: 0 },
    { type: "victory", monster: boss, xp: 0, coins: 0, timestamp: 0 },
  ];
}

function bossOnly(dungeonId: DungeonId, floor: number): LogEntry[] {
  const boss = createMonsterForFloor(dungeonId, floor, true);
  return [
    { type: "boss", monster: boss, floor, timestamp: 0 },
    { type: "encounter", monster: boss, timestamp: 0 },
  ];
}

function endEntry(reason: SessionEndReason): LogEntry {
  return { type: "sessionEnd", reason, timestamp: 0 };
}

describe("calculateDungeonProgress — 보스층 롤백 (피드백 19/26/31)", () => {
  const existing = {
    dungeonId: "fitness" as const,
    floorReached: 15,
    bestFloorReached: 15,
    bossesDefeated: [10],
  };

  it("F20 보스 앞에서 포기 → floorReached 19, best 20", () => {
    const s = makeSession("fitness", 20, [...bossOnly("fitness", 20), endEntry("heroAbandoned")]);
    const bosses = calculateBossesDefeated(s.log, existing.bossesDefeated);
    const p = calculateDungeonProgress(s, existing, bosses);
    expect(p.floorReached).toBe(19);
    expect(p.bestFloorReached).toBe(20);
    expect(p.bossesDefeated).toEqual([10]);
  });

  it("F30 미처치 시간초과 → 29", () => {
    const s = makeSession("fitness", 30, [...bossOnly("fitness", 30), endEntry("timeExpired")]);
    const p = calculateDungeonProgress(s, existing, [10, 20]);
    expect(p.floorReached).toBe(29);
    expect(p.bestFloorReached).toBe(30);
  });

  it("F31 사망 + F30 미처치 → 체크포인트 30 이 29 로", () => {
    const s = makeSession("fitness", 31, [endEntry("heroDied")]);
    const p = calculateDungeonProgress(s, existing, [10, 20]);
    expect(p.floorReached).toBe(29);
    expect(p.bestFloorReached).toBe(31);
  });

  it("F31 사망 + F30 처치됨 → 30", () => {
    const s = makeSession("fitness", 31, [endEntry("heroDied")]);
    const p = calculateDungeonProgress(s, existing, [10, 20, 30]);
    expect(p.floorReached).toBe(30);
  });

  it("F30 보스 처치 종료 → 30", () => {
    const log = [...bossVictory("fitness", 30), endEntry("bossDefeated")];
    const s = makeSession("fitness", 30, log);
    const bosses = calculateBossesDefeated(log, [10, 20]);
    const p = calculateDungeonProgress(s, existing, bosses);
    expect(p.floorReached).toBe(30);
    expect(p.bossesDefeated).toEqual([10, 20, 30]);
  });

  it("F25 포기 (보스층 아님) → 25 그대로", () => {
    const s = makeSession("fitness", 25, [endEntry("heroAbandoned")]);
    const p = calculateDungeonProgress(s, existing, [10]);
    expect(p.floorReached).toBe(25);
  });

  it("F30 보스에게 사망 → 체크포인트 30 → 미처치라 29", () => {
    const s = makeSession("fitness", 30, [...bossOnly("fitness", 30), endEntry("heroDied")]);
    const p = calculateDungeonProgress(s, existing, [10, 20]);
    expect(p.floorReached).toBe(29);
  });

  it("기존 floorReached 는 절대 후퇴하지 않는다", () => {
    const s = makeSession("fitness", 10, [...bossOnly("fitness", 10), endEntry("heroAbandoned")]);
    const p = calculateDungeonProgress(s, { ...existing, floorReached: 12 }, [10]);
    expect(p.floorReached).toBe(12);
  });
});

describe("calculateBossesDefeated — 상한 없음", () => {
  it("F40 보스 승리가 기록된다", () => {
    const log = bossVictory("fitness", 40);
    expect(calculateBossesDefeated(log, [10, 20, 30])).toEqual([10, 20, 30, 40]);
  });
});

describe("resolveStartFloor", () => {
  it.each([
    [undefined, 1],
    [{ floorReached: 0, bossesDefeated: [] }, 1],
    [{ floorReached: 5, bossesDefeated: [] }, 6],
    [{ floorReached: 20, bossesDefeated: [] }, 10],
    [{ floorReached: 20, bossesDefeated: [10] }, 20],
    [{ floorReached: 21, bossesDefeated: [10] }, 20],
    [{ floorReached: 25, bossesDefeated: [10, 20] }, 26],
    [{ floorReached: 45, bossesDefeated: [10, 20, 30] }, 40],
    [{ floorReached: 45, bossesDefeated: [10, 20, 30, 40] }, 46],
    [{ floorReached: 19, bossesDefeated: [10] }, 20],
    [{ floorReached: 30, bossesDefeated: [10, 20, 30] }, 31],
  ])("%j → %i", (progress, expected) => {
    const full = progress
      ? { dungeonId: "fitness" as const, bestFloorReached: progress.floorReached, ...progress }
      : undefined;
    expect(resolveStartFloor(full)).toBe(expected);
  });
});

describe("computeWeeklyClearReward (피드백 30)", () => {
  it("WEEKLY_DUNGEON_COUNT 는 던전 수와 같다", () => {
    expect(WEEKLY_DUNGEON_COUNT).toBe(DUNGEON_LIST.length);
  });

  it("주간 세션이 아니면 null", () => {
    const s = makeSession("fitness", 30, bossVictory("fitness", 30));
    expect(computeWeeklyClearReward(s, { clearedDungeons: [] })).toBeNull();
  });

  it("첫 클리어 → 600 코인 + 소실방지권 1", () => {
    const s = makeSession("fitness", 30, bossVictory("fitness", 30), { isWeeklyVariant: true, startFloor: 30 });
    expect(computeWeeklyClearReward(s, { clearedDungeons: [] })).toEqual({
      firstClear: true,
      allClear: false,
      coins: WEEKLY_FIRST_CLEAR_COINS,
      destroyGuards: WEEKLY_FIRST_CLEAR_DESTROY_GUARDS,
      downGuards: 0,
    });
  });

  it("7 → 8 전환이면 올클리어 보너스 합산", () => {
    const others = DUNGEON_LIST.map((d) => d.id).filter((id) => id !== "fitness");
    expect(others).toHaveLength(7);
    const s = makeSession("fitness", 30, bossVictory("fitness", 30), { isWeeklyVariant: true, startFloor: 30 });
    expect(computeWeeklyClearReward(s, { clearedDungeons: others })).toEqual({
      firstClear: true,
      allClear: true,
      coins: WEEKLY_FIRST_CLEAR_COINS + WEEKLY_ALL_CLEAR_COINS,
      destroyGuards: WEEKLY_FIRST_CLEAR_DESTROY_GUARDS + WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
      downGuards: WEEKLY_ALL_CLEAR_DOWN_GUARDS,
    });
  });

  it("이미 클리어한 던전이면 null", () => {
    const s = makeSession("fitness", 30, bossVictory("fitness", 30), { isWeeklyVariant: true, startFloor: 30 });
    expect(computeWeeklyClearReward(s, { clearedDungeons: ["fitness"] })).toBeNull();
  });

  it("보스 승리가 없으면 null", () => {
    const s = makeSession("fitness", 30, [...bossOnly("fitness", 30), endEntry("heroDied")], {
      isWeeklyVariant: true,
      startFloor: 30,
    });
    expect(computeWeeklyClearReward(s, { clearedDungeons: [] })).toBeNull();
  });

  it("weeklyVariant 가 없으면 null", () => {
    const s = makeSession("fitness", 30, bossVictory("fitness", 30), { isWeeklyVariant: true, startFloor: 30 });
    expect(computeWeeklyClearReward(s, undefined)).toBeNull();
  });
});
