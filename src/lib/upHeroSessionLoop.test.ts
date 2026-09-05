import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BOSS_REGEN_PCT,
  MONSTER_REGEN_PCT,
  REGEN_STOP_BELOW_HP_RATIO,
  createSession,
  isBossFloor,
  nextBossFloorAfter,
  normalizeSessionForLoad,
  resolveChoice,
  resolveMinigame,
  rollEnemyOutcome,
  tickSession,
} from "./upHeroCombat";
import { setRngSeed, resetRng } from "./upHeroRng";
import { createMonsterForFloor, scaleMonster, ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";
import { DUNGEONS } from "@/data/upHeroDungeons";
import {
  computeHeroForLevel,
  createDefaultHero,
  type ChoiceEffect,
  type CombatSession,
  type DungeonId,
  type Monster,
} from "@/types/uphero";

/**
 * Phase 16 (Track C) — 던전 코어 루프 회귀 테스트.
 *
 * 피드백 14 (미니게임 안 뜸) / 19·26·31 (보스 스킵) / 28 (F30 이후 보스 없음) /
 * 16 (regen 무적) 의 엔진 계약을 시드 고정으로 못박는다. iOS
 * UpHeroSessionLoopTests.swift 가 같은 시드 (Mulberry32) 로 같은 단언을 한다.
 */

const DEFAULT_SEED = 4242;

function strongHero(level = 30) {
  // 전투가 시험 대상이 아닐 때는 죽지 않는 영웅을 쓴다.
  const base = computeHeroForLevel(createDefaultHero("ko"), level);
  return {
    ...base,
    baseStats: { ...base.baseStats, str: 200, vit: 200 },
    hp: 5000,
    maxHp: 5000,
  };
}

function sessionAt(dungeonId: DungeonId, floor: number): CombatSession {
  const s = createSession(dungeonId, strongHero(), floor, undefined, {
    heroLevel: 30,
  });
  return s;
}

/** choice 엔트리를 꽂고 대기 상태로 만든다 (upHeroSlotCombat.test 과 같은 패턴). */
function armChoice(s: CombatSession, effect: ChoiceEffect): CombatSession {
  const idx = s.log.length;
  s.log.push({
    type: "choice",
    prompt: "시험용 선택지",
    options: [{ label: "고른다", effect, resultText: "골랐다" }],
    timestamp: Date.now(),
  });
  s.status = "awaitingChoice";
  s.pendingChoiceIndex = idx;
  return s;
}

function lastEntry(s: CombatSession) {
  return s.log[s.log.length - 1];
}

function bossIndexFor(floor: number): number {
  return (((floor / 10 - 1) % 3) + 3) % 3;
}

describe("boss cadence helpers", () => {
  it("isBossFloor: 10 의 배수, 상한 없음, 0 은 아님", () => {
    expect(isBossFloor(0)).toBe(false);
    expect(isBossFloor(9)).toBe(false);
    for (const f of [10, 20, 30, 40, 60, 90, 120, 1000]) expect(isBossFloor(f)).toBe(true);
    expect(isBossFloor(31)).toBe(false);
  });

  it("nextBossFloorAfter: 현재 층 *이후* 첫 보스층", () => {
    expect(nextBossFloorAfter(1)).toBe(10);
    expect(nextBossFloorAfter(9)).toBe(10);
    expect(nextBossFloorAfter(10)).toBe(20);
    expect(nextBossFloorAfter(30)).toBe(40);
    expect(nextBossFloorAfter(35)).toBe(40);
    expect(nextBossFloorAfter(99)).toBe(100);
  });
});

describe("미니게임 진입 / 해소 (피드백 14)", () => {
  beforeEach(() => setRngSeed(DEFAULT_SEED));
  afterEach(() => resetRng());

  const minigameEffect: ChoiceEffect = {
    kind: "startMinigame",
    minigame: "quick_sum",
    difficulty: 2,
    successEffects: [{ kind: "reward", xp: 30 }],
    failEffects: [{ kind: "damage", amount: 10 }],
  };

  it("resolveChoice 가 awaitingMinigame 을 덮어쓰지 않는다", () => {
    const before = armChoice(sessionAt("learning", 5), minigameEffect);
    const timeBefore = before.time;
    const s = resolveChoice(before, 0);
    expect(s.status).toBe("awaitingMinigame");
    expect(s.pendingMinigame?.minigame).toBe("quick_sum");
    // F5 → floor boost 0 → 난이도 그대로 2.
    expect(s.pendingMinigame?.difficulty).toBe(2);
    expect(s.pendingChoiceIndex).toBeUndefined();
    // choice 해소 시간 (TIME_COST.choice = 1) 은 그대로 빠진다.
    expect(s.time).toBe(timeBefore - 1);
  });

  it("resolveMinigame(true) 는 보상을 주고 active 로 돌아온다", () => {
    const armed = resolveChoice(armChoice(sessionAt("learning", 5), minigameEffect), 0);
    const xpBefore = armed.rewards.xp;
    const s = resolveMinigame(armed, true);
    expect(s.rewards.xp).toBe(xpBefore + 30);
    expect(s.status).toBe("active");
    expect(s.pendingMinigame).toBeUndefined();
    expect(lastEntry(s)).toMatchObject({
      type: "choiceResult",
      actionLabelKey: "uphero.combat.minigame.success",
    });
  });

  it("resolveMinigame(false) 는 페널티를 적용한다", () => {
    const armed = resolveChoice(armChoice(sessionAt("learning", 5), minigameEffect), 0);
    const hpBefore = armed.hero.hp;
    const s = resolveMinigame(armed, false);
    expect(s.hero.hp).toBe(hpBefore - 10);
    expect(s.status).toBe("active");
  });

  it("일반 선택지는 여전히 active 로 돌아온다", () => {
    const s = resolveChoice(armChoice(sessionAt("learning", 5), { kind: "reward", xp: 5 }), 0);
    expect(s.status).toBe("active");
    expect(s.pendingChoiceIndex).toBeUndefined();
  });

  it("tickSession 은 awaitingMinigame 에서 아무것도 하지 않는다", () => {
    const armed = resolveChoice(armChoice(sessionAt("learning", 5), minigameEffect), 0);
    expect(tickSession(armed)).toBe(armed);
  });
});

describe("시작층이 보스층이면 createSession 이 보스를 스폰한다 (피드백 19)", () => {
  beforeEach(() => setRngSeed(DEFAULT_SEED));
  afterEach(() => resetRng());

  for (const startFloor of [10, 20, 30, 40]) {
    it(`startFloor ${startFloor}`, () => {
      const s = sessionAt("fitness", startFloor);
      const last = lastEntry(s);
      expect(last.type).toBe("boss");
      if (last.type !== "boss") return;
      expect(last.floor).toBe(startFloor);
      expect(s.status).toBe("paused");
      expect(last.monster.templateId).toBe(
        DUNGEONS.fitness.bossIds[bossIndexFor(startFloor)],
      );
      expect(last.monster.level).toBe(startFloor);
    });
  }

  it("startFloor 11 은 보스 없이 시작", () => {
    const s = sessionAt("fitness", 11);
    expect(s.log.some((e) => e.type === "boss")).toBe(false);
    expect(s.status).toBe("active");
  });

  it("주간 악몽 (startFloor 30) 도 같은 경로", () => {
    const s = createSession("fitness", strongHero(), 30, undefined, {
      isWeeklyVariant: true,
      heroLevel: 30,
    });
    expect(lastEntry(s)).toMatchObject({ type: "boss", floor: 30 });
    expect(s.status).toBe("paused");
  });
});

describe("층 전환 시 보스 스폰 — 10층마다 영원히 (피드백 28)", () => {
  beforeEach(() => setRngSeed(DEFAULT_SEED));
  afterEach(() => resetRng());

  function withVictoryAt(dungeonId: DungeonId, floor: number): CombatSession {
    const s = sessionAt(dungeonId, floor);
    const monster = createMonsterForFloor(dungeonId, floor, false);
    s.log.push({ type: "victory", monster, xp: 0, coins: 0, timestamp: Date.now() });
    // 시작층이 보스층이면 createSession 이 paused 로 두므로 명시적으로 재개.
    s.status = "active";
    return s;
  }

  for (const [from, idx] of [
    [9, 0],
    [19, 1],
    [39, 0],
    [59, 2],
    [89, 2],
  ] as const) {
    it(`F${from} 승리 뒤 tick → F${from + 1} 보스 (템플릿 ${idx}) + paused`, () => {
      const s = tickSession(withVictoryAt("learning", from));
      const floorEntry = s.log[s.log.length - 2];
      expect(floorEntry).toMatchObject({ type: "floor", from, to: from + 1 });
      expect(s.currentFloor).toBe(from + 1);
      const last = lastEntry(s);
      expect(last).toMatchObject({ type: "boss", floor: from + 1 });
      if (last.type !== "boss") return;
      expect(last.monster.templateId).toBe(DUNGEONS.learning.bossIds[idx]);
      expect(s.status).toBe("paused");
    });
  }

  it("F30 은 여전히 보스층이 아닌 F31 로 이어진다 (보스 없음)", () => {
    const s = tickSession(withVictoryAt("learning", 30));
    expect(s.currentFloor).toBe(31);
    expect(lastEntry(s).type).toBe("floor");
    expect(s.status).toBe("active");
  });
});

describe("보스 처치 후 종료 조건 — F30 만 최종 (피드백 28)", () => {
  beforeEach(() => setRngSeed(DEFAULT_SEED));
  afterEach(() => resetRng());

  /** 보스 encounter 를 열고 영웅 공격 엔트리로 HP 를 0 까지 깎아 둔다. */
  function bossAtZeroHp(dungeonId: DungeonId, floor: number): {
    s: CombatSession;
    boss: Monster;
  } {
    const s = sessionAt(dungeonId, floor);
    const bossEntry = lastEntry(s);
    if (bossEntry.type !== "boss") throw new Error("boss expected");
    const boss = bossEntry.monster;
    s.status = "active";
    s.log.push({ type: "encounter", monster: boss, timestamp: Date.now() });
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: boss.hp,
      outcome: "hit",
      timestamp: Date.now(),
    });
    return { s, boss };
  }

  it("F30 보스 처치 → sessionEnd bossDefeated", () => {
    const { s, boss } = bossAtZeroHp("fitness", 30);
    const next = tickSession(s);
    expect(next.log.some((e) => e.type === "victory" && e.monster.templateId === boss.templateId)).toBe(true);
    expect(lastEntry(next)).toMatchObject({ type: "sessionEnd", reason: "bossDefeated" });
    expect(next.status).toBe("completed");
  });

  it("F60 보스 처치 → 드롭 후 계속, 다음 tick 에 F61", () => {
    const { s } = bossAtZeroHp("fitness", 60);
    const afterVictory = tickSession(s);
    expect(afterVictory.status).toBe("active");
    expect(afterVictory.log.some((e) => e.type === "sessionEnd")).toBe(false);
    expect(afterVictory.log.some((e) => e.type === "victory" && e.monster.isBoss)).toBe(true);
    // 보스는 반드시 장비를 떨군다.
    expect(afterVictory.rewards.drops.length).toBeGreaterThanOrEqual(1);
    const moved = tickSession(afterVictory);
    expect(moved.currentFloor).toBe(61);
    expect(lastEntry(moved)).toMatchObject({ type: "floor", from: 60, to: 61 });
  });

  it("F10 보스 처치 → 계속 (기존 동작 유지)", () => {
    const { s } = bossAtZeroHp("fitness", 10);
    const afterVictory = tickSession(s);
    expect(afterVictory.status).toBe("active");
    expect(tickSession(afterVictory).currentFloor).toBe(11);
  });
});

describe("skipFloors 는 다음 보스층 직전까지만 (피드백 26)", () => {
  beforeEach(() => setRngSeed(DEFAULT_SEED));
  afterEach(() => resetRng());

  it("F17 +3 → F19 (클램프)", () => {
    const s = resolveChoice(armChoice(sessionAt("fitness", 17), { kind: "skipFloors", count: 3 }), 0);
    expect(s.currentFloor).toBe(19);
    expect(s.log.some((e) => e.type === "floor" && e.from === 17 && e.to === 19)).toBe(true);
    expect(s.status).toBe("active");
  });

  it("F15 +2 → F17 (클램프 안 걸림)", () => {
    const s = resolveChoice(armChoice(sessionAt("fitness", 15), { kind: "skipFloors", count: 2 }), 0);
    expect(s.currentFloor).toBe(17);
  });

  it("F19 +2 → 이동 없음 + skipBlocked narrative, floor 엔트리 없음", () => {
    const before = armChoice(sessionAt("fitness", 19), { kind: "skipFloors", count: 2 });
    const floorEntriesBefore = before.log.filter((e) => e.type === "floor").length;
    const s = resolveChoice(before, 0);
    expect(s.currentFloor).toBe(19);
    expect(s.log.filter((e) => e.type === "floor").length).toBe(floorEntriesBefore);
    expect(
      s.log.some(
        (e) => e.type === "narrative" && e.narrativeKey === "uphero.combat.narrative.skipBlocked",
      ),
    ).toBe(true);
    expect(s.status).toBe("active");
  });

  it("F35 +10 → F39 (사이클 경계도 안 넘음)", () => {
    const s = resolveChoice(armChoice(sessionAt("fitness", 35), { kind: "skipFloors", count: 10 }), 0);
    expect(s.currentFloor).toBe(39);
  });
});

describe("regen — 보스 1%, 30% 미만 정지 (피드백 16)", () => {
  beforeEach(() => setRngSeed(DEFAULT_SEED));
  afterEach(() => resetRng());

  it("상수 계약", () => {
    expect(MONSTER_REGEN_PCT).toBe(0.05);
    expect(BOSS_REGEN_PCT).toBe(0.01);
    expect(REGEN_STOP_BELOW_HP_RATIO).toBe(0.3);
  });

  it("F20 온천의 여왕 (regen 보스) 은 maxHp 의 1% 만 회복한다", () => {
    const s = sessionAt("wellness", 20);
    const bossEntry = lastEntry(s);
    if (bossEntry.type !== "boss") throw new Error("boss expected");
    expect(bossEntry.monster.templateId).toBe("boss_river_naiad");
    expect(bossEntry.monster.trait).toBe("regen");
    s.status = "active";
    const opened = tickSession(s); // boss → encounter + initMonsterTraitState
    expect(lastEntry(opened).type).toBe("encounter");
    expect(opened.monsterRegenAmount).toBe(
      Math.max(2, Math.round(bossEntry.monster.hp * BOSS_REGEN_PCT)),
    );
  });

  it("HP 가 30% 미만이면 regen 엔트리를 push 하지 않는다", () => {
    const s = sessionAt("wellness", 20);
    const bossEntry = lastEntry(s);
    if (bossEntry.type !== "boss") throw new Error("boss expected");
    const boss = bossEntry.monster;
    s.status = "active";
    const opened = tickSession(s);
    // 영웅 공격으로 HP 를 25% 까지 깎는다.
    const cut = Math.ceil(boss.hp * 0.75);
    opened.log.push({
      type: "combat",
      attacker: "hero",
      damage: cut,
      outcome: "hit",
      timestamp: Date.now(),
    });
    const before = opened.log.length;
    const next = tickSession(opened);
    const newEntries = next.log.slice(before);
    expect(newEntries.some((e) => e.type === "monsterEffect" && e.effect === "regen")).toBe(false);
    // 라운드 자체는 진행됐다 (영웅/적 공격 엔트리).
    expect(newEntries.some((e) => e.type === "combat")).toBe(true);
  });

  it("HP 가 30% 이상이면 regen 엔트리를 push 한다", () => {
    const s = sessionAt("wellness", 20);
    s.status = "active";
    const opened = tickSession(s);
    const before = opened.log.length;
    const next = tickSession(opened);
    const newEntries = next.log.slice(before);
    expect(newEntries.some((e) => e.type === "monsterEffect" && e.effect === "regen")).toBe(true);
  });

  it("일반 regen 몬스터 (F15) 는 5% 유지", () => {
    const template = ALL_MONSTER_TEMPLATES.find((t) => t.id === "wel_naiad");
    if (!template) throw new Error("template");
    const monster = scaleMonster(template, "wellness", 15);
    expect(monster.trait).toBe("regen");
    const s = sessionAt("wellness", 15);
    // boss 엔트리 경로로 encounter 를 열어 initMonsterTraitState 를 태운다.
    s.log.push({ type: "boss", monster, floor: 15, timestamp: Date.now() });
    const opened = tickSession(s);
    expect(opened.monsterRegenAmount).toBe(
      Math.max(2, Math.round(monster.hp * MONSTER_REGEN_PCT)),
    );
  });
});

describe("normalizeSessionForLoad", () => {
  const pending = {
    minigame: "quick_sum" as const,
    difficulty: 1 as const,
    successEffects: [],
    failEffects: [],
  };

  it("active 인데 pendingMinigame 이 남아 있으면 지운다", () => {
    const s = sessionAt("learning", 5);
    s.pendingMinigame = pending;
    const n = normalizeSessionForLoad(s);
    expect(n.pendingMinigame).toBeUndefined();
    expect(n.status).toBe("active");
  });

  it("awaitingMinigame 인데 pending 이 없으면 active 로", () => {
    const s = sessionAt("learning", 5);
    s.status = "awaitingMinigame";
    expect(normalizeSessionForLoad(s).status).toBe("active");
  });

  it("정상 awaitingMinigame 은 그대로", () => {
    const s = sessionAt("learning", 5);
    s.status = "awaitingMinigame";
    s.pendingMinigame = pending;
    const n = normalizeSessionForLoad(s);
    expect(n.status).toBe("awaitingMinigame");
    expect(n.pendingMinigame).toEqual(pending);
  });

  it("awaitingChoice 인데 index 가 choice 를 가리키지 않으면 active 로", () => {
    const s = sessionAt("learning", 5);
    s.status = "awaitingChoice";
    s.pendingChoiceIndex = 999;
    const n = normalizeSessionForLoad(s);
    expect(n.status).toBe("active");
    expect(n.pendingChoiceIndex).toBeUndefined();
  });

  it("정상 awaitingChoice 는 그대로", () => {
    const s = armChoice(sessionAt("learning", 5), { kind: "nothing" });
    const n = normalizeSessionForLoad(s);
    expect(n.status).toBe("awaitingChoice");
    expect(n.pendingChoiceIndex).toBe(s.pendingChoiceIndex);
  });

  it("원본을 변경하지 않는다", () => {
    const s = sessionAt("learning", 5);
    s.pendingMinigame = pending;
    normalizeSessionForLoad(s);
    expect(s.pendingMinigame).toEqual(pending);
  });
});

describe("rollEnemyOutcome miss 하한 5%", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Lv200 몬스터도 0.049 롤이면 빗나간다", () => {
    resetRng();
    vi.spyOn(Math, "random").mockReturnValue(0.049);
    const monster = createMonsterForFloor("fitness", 200, false);
    const stats = createDefaultHero("ko").baseStats;
    expect(rollEnemyOutcome(monster, stats)).toBe("miss");
  });

  it("0.051 롤은 빗나가지 않는다 (dodge 도 0 이라 hit/crit)", () => {
    resetRng();
    vi.spyOn(Math, "random").mockReturnValue(0.051);
    const monster = createMonsterForFloor("fitness", 200, false);
    const stats = { ...createDefaultHero("ko").baseStats, agi: 0 };
    expect(rollEnemyOutcome(monster, stats)).not.toBe("miss");
  });
});
