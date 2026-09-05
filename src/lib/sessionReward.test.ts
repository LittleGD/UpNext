import { describe, it, expect } from "vitest";
import {
  WEEKLY_ALL_CLEAR_COINS,
  WEEKLY_ALL_CLEAR_DESTROY_GUARDS,
  WEEKLY_ALL_CLEAR_DOWN_GUARDS,
  WEEKLY_DUNGEON_COUNT,
  WEEKLY_FIRST_CLEAR_COINS,
  WEEKLY_FIRST_CLEAR_DESTROY_GUARDS,
  calculateBossesDefeated,
  calculateCodexDelta,
  calculateDungeonProgress,
  computeWeeklyClearReward,
  resolveStartFloor,
  splitDropsByCap,
} from "./sessionReward";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { createMonsterForFloor } from "@/data/upHeroMonsters";
import {
  createDefaultHero,
  type CombatSession,
  type DungeonId,
  type Equipment,
  type LogEntry,
  type SessionEndReason,
} from "@/types/uphero";

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

/* ══════════════════════════════════════════════════════════════════════
 * Phase 6-E (Track E) — 도감 델타 (피드백 18) / 가방 상한 분배 (피드백 22)
 * ══════════════════════════════════════════════════════════════════════ */

function eq(overrides: Partial<Equipment>): Equipment {
  return {
    id: "e",
    name: "x",
    type: "weapon",
    rarity: "normal",
    category: "fitness",
    iconName: "Sword",
    stats: { str: 5 },
    ...overrides,
  };
}

describe("calculateCodexDelta (Track E)", () => {
  const legendSword = eq({
    id: "l1",
    baseId: "self_control_sword",
    name: "신성한 자기절제의 검 of 민첩, 힘",
    rarity: "legend",
  });
  const legacyArmor = eq({
    id: "r1",
    name: "빛나는 곡물의 갑옷 of 힘",
    rarity: "rare",
    type: "armor",
    category: "nutrition",
  });
  const empty = { monsters: [], bosses: [], equipment: [] };

  it("로그 drop 은 baseName 으로 기록된다 (baseId 우선, 없으면 이름 규칙)", () => {
    const log: LogEntry[] = [
      { type: "drop", equipment: legendSword, timestamp: 1 },
      { type: "drop", equipment: legacyArmor, timestamp: 2 },
    ];
    expect(calculateCodexDelta(log, empty).equipment).toEqual(["자기절제의 검", "곡물의 갑옷"]);
  });

  it("기존 항목과 dedupe", () => {
    const log: LogEntry[] = [{ type: "drop", equipment: legendSword, timestamp: 1 }];
    const out = calculateCodexDelta(log, { ...empty, equipment: ["자기절제의 검"] });
    expect(out.equipment).toEqual(["자기절제의 검"]);
  });

  it("rewards.drops 와 합집합 — 로그가 잘려도 드롭은 남는다", () => {
    const out = calculateCodexDelta([], empty, [legendSword, legacyArmor]);
    expect(out.equipment).toEqual(["자기절제의 검", "곡물의 갑옷"]);
  });

  it("사진 부적은 로그에서도 rewards 에서도 도감에 넣지 않는다", () => {
    const photo = eq({ id: "p", type: "talisman", photoId: "ph-1", name: "달리기" });
    const log: LogEntry[] = [{ type: "drop", equipment: photo, timestamp: 1 }];
    expect(calculateCodexDelta(log, empty, [photo]).equipment).toEqual([]);
  });
});

describe("splitDropsByCap", () => {
  const drops = [1, 2, 3, 4, 5].map((n) => eq({ id: `d${n}` }));

  it("28 + 5 (cap 30) → fits 2 / overflow 3, 순서 보존", () => {
    const { fits, overflow } = splitDropsByCap(28, drops, 30);
    expect(fits.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(overflow.map((d) => d.id)).toEqual(["d3", "d4", "d5"]);
  });

  it("가득 찬 가방은 전부 overflow, 넘친 가방(31) 도 음수 없이 전부 overflow", () => {
    expect(splitDropsByCap(30, drops, 30).fits).toEqual([]);
    expect(splitDropsByCap(30, drops, 30).overflow.length).toBe(5);
    expect(splitDropsByCap(31, drops, 30).fits).toEqual([]);
  });

  it("여유가 충분하면 overflow 없음", () => {
    const { fits, overflow } = splitDropsByCap(0, drops, 30);
    expect(fits.length).toBe(5);
    expect(overflow).toEqual([]);
  });
});
