import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createSession,
  resolveChoice,
  tickSession,
  sessionStats,
  runStatPct,
  advanceRunModFloors,
  floorRewardScale,
  choiceRewardMult,
  scaleChoiceEffectsForFloor,
  summarizeEffectsData,
  summarizeEffects,
  RUN_STAT_MODS_CAP,
  RUN_BOSS_DMG_CAP,
  RUN_STEALTH_CAP,
  RUN_GUARANTEED_DROP_CAP,
} from "./upHeroCombat";
import { setRngSeed, resetRng } from "./upHeroRng";
import { createMonsterForFloor } from "@/data/upHeroMonsters";
import { affixStatLabel, buildSummaryChips } from "./upHeroI18n";
import { t, ensureLanguage, type DictKey } from "@/i18n";
import {
  createDefaultHero,
  type ChoiceEffect,
  type CombatSession,
  type LogEntry,
} from "@/types/uphero";

/**
 * Phase 4-D (Track D, 피드백 15/35) — 런 한정 빌드 회귀 테스트.
 *
 *  - runBuff/runCurse 는 `runStatMods` 에 쌓이고 `sessionStats` 가 combatBuff 뒤에
 *    스탯별 합산 pct 를 한 번 곱한다 (2단 반올림, clamp [-50, +100]).
 *  - 층 이동(tick / skipFloors 실제 이동 수)마다 floorsLeft 가 줄고 만료는 사라진다.
 *  - stealth 는 조우 rng 를 그대로 소비하고 조우 대신 stealthPass 서사 (보스 제외).
 *  - guaranteedDrop 은 드롭 rng 를 항상 소비하고 드롭을 강제한다.
 *  - revealBoss 는 다음 보스층 (Track C nextBossFloorAfter) 의 trait 를 밝히고
 *    보스 피해 +5% (상한 15) 를 준다. F30 에서는 F40 보스.
 *  - 선택 보상은 층·영웅 기준으로 스케일된 뒤 요약·적용된다.
 *  iOS UpHeroRunModsTests.swift 가 같은 수치를 단언한다.
 */

function newSession(floor = 1): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), floor);
  // mystery "?" 층이 조우 분기를 가로채지 않게 비운다 (테스트는 일반 층만 본다).
  s.mysteryFloors = [];
  return s;
}

/** 합성 이벤트 하나를 세션에 꽂고 선택 대기 상태로 만든다. */
function armChoice(s: CombatSession, effects: ChoiceEffect[]): CombatSession {
  const idx = s.log.length;
  s.log.push({
    type: "choice",
    prompt: "synthetic",
    options: [
      {
        label: "go",
        outcomes: [{ weight: 1, resultText: "done", effects }],
      },
    ],
    timestamp: Date.now(),
  });
  s.status = "awaitingChoice";
  s.pendingChoiceIndex = idx;
  return s;
}

function narrativesWithKey(s: CombatSession, key: string) {
  return s.log.filter(
    (e): e is Extract<LogEntry, { type: "narrative" }> =>
      e.type === "narrative" && e.narrativeKey === key,
  );
}

function lastResult(s: CombatSession) {
  for (let i = s.log.length - 1; i >= 0; i -= 1) {
    const e = s.log[i];
    if (e.type === "choiceResult") return e;
  }
  return null;
}

describe("런 한정 빌드 — 버프/저주 적립", () => {
  afterEach(() => resetRng());

  it("runBuff 는 runStatMods 에 쌓이고 runBuff 서사를 남긴다", () => {
    setRngSeed(1);
    const s = resolveChoice(
      armChoice(newSession(), [{ kind: "runBuff", stat: "str", pct: 5, floors: 5 }]),
      0,
    );
    expect(s.runStatMods).toEqual([{ stat: "str", pct: 5, floorsLeft: 5 }]);
    const narr = narrativesWithKey(s, "uphero.combat.narrative.runBuff");
    expect(narr).toHaveLength(1);
    expect(narr[0].narrativeParams).toMatchObject({ statId: "str", pct: 5, floors: 5 });
    expect(lastResult(s)?.effectSummaryData).toEqual({
      runMods: [{ stat: "str", pct: 5, floors: 5 }],
    });
  });

  it("runCurse 는 음수 pct 로 같은 배열에 쌓인다 (런 끝까지면 floorsLeft 없음)", () => {
    setRngSeed(1);
    const s = resolveChoice(
      armChoice(newSession(), [{ kind: "runCurse", stat: "agi", pct: 5 }]),
      0,
    );
    expect(s.runStatMods).toEqual([{ stat: "agi", pct: -5 }]);
    expect(narrativesWithKey(s, "uphero.combat.narrative.runCurse")).toHaveLength(1);
    expect(lastResult(s)?.effectSummaryData).toEqual({
      runMods: [{ stat: "agi", pct: -5 }],
    });
  });

  it("상한 8 건 — 초과하면 오래된 것부터 버린다", () => {
    const s = newSession();
    setRngSeed(1);
    let cur = s;
    for (let i = 1; i <= RUN_STAT_MODS_CAP + 1; i += 1) {
      cur = resolveChoice(
        armChoice(cur, [{ kind: "runBuff", stat: "str", pct: i, floors: 9 }]),
        0,
      );
    }
    expect(cur.runStatMods).toHaveLength(RUN_STAT_MODS_CAP);
    expect(cur.runStatMods?.[0].pct).toBe(2);
    expect(cur.runStatMods?.[RUN_STAT_MODS_CAP - 1].pct).toBe(RUN_STAT_MODS_CAP + 1);
  });
});

describe("sessionStats — combatBuff 뒤 스탯별 합산 pct 1회 곱 (2단 반올림)", () => {
  it("str 20 + combatBuff 10% + [str+5, all-50, agi+200] → str 12, agi clamp +100", () => {
    const s = newSession();
    s.hero = {
      ...s.hero,
      baseStats: { ...s.hero.baseStats, str: 20, agi: 10, crit: 7 },
    };
    s.combatBuff = { pct: 10, battlesLeft: 3 };
    s.runStatMods = [
      { stat: "str", pct: 5 },
      { stat: "all", pct: -50 },
      { stat: "agi", pct: 200 },
    ];
    expect(runStatPct(s, "str")).toBe(-45);
    expect(runStatPct(s, "agi")).toBe(100);
    expect(runStatPct(s, "int")).toBe(-50);
    const st = sessionStats(s);
    // round(20 × 1.1) = 22 → round(22 × 0.55) = 12 (한 번에 곱하면 12.1 → 12 로 같지만
    //   다른 조합에서 1 차이가 나므로 2단 반올림을 계약으로 고정).
    expect(st.str).toBe(12);
    // round(10 × 1.1) = 11 → +100% clamp → 22
    expect(st.agi).toBe(22);
    // crit / slotBonus 는 곱하지 않는다.
    expect(st.crit).toBe(7);
    expect(st.slotBonus).toBe(0);
  });

  it("보정이 없으면 기존 combatBuff 결과 그대로", () => {
    const s = newSession();
    s.combatBuff = { pct: 10, battlesLeft: 1 };
    expect(sessionStats(s).str).toBe(11);
    s.runStatMods = [];
    expect(sessionStats(s).str).toBe(11);
  });
});

describe("advanceRunModFloors — 층 이동으로 만료", () => {
  afterEach(() => resetRng());

  it("tick 층 전환에서 floorsLeft 1 은 만료되고 런 끝까지 보정은 남는다", () => {
    const s = newSession();
    s.log.push({ type: "narrative", text: "x", timestamp: Date.now() });
    s.runStatMods = [
      { stat: "str", pct: 5, floorsLeft: 1 },
      { stat: "int", pct: 5 },
    ];
    setRngSeed(3);
    const next = tickSession(s);
    expect(next.currentFloor).toBe(2);
    expect(next.runStatMods).toEqual([{ stat: "int", pct: 5 }]);
  });

  it("skipFloors 는 실제 이동한 층 수만큼 줄인다 (보스 문 앞 클램프 포함)", () => {
    setRngSeed(1);
    const s = newSession();
    s.runStatMods = [{ stat: "str", pct: 5, floorsLeft: 3 }];
    const moved = resolveChoice(armChoice(s, [{ kind: "skipFloors", count: 2 }]), 0);
    expect(moved.currentFloor).toBe(3);
    expect(moved.runStatMods).toEqual([{ stat: "str", pct: 5, floorsLeft: 1 }]);

    const atNine = newSession(9);
    atNine.runStatMods = [{ stat: "str", pct: 5, floorsLeft: 3 }];
    const blocked = resolveChoice(armChoice(atNine, [{ kind: "skipFloors", count: 3 }]), 0);
    expect(blocked.currentFloor).toBe(9);
    expect(blocked.runStatMods).toEqual([{ stat: "str", pct: 5, floorsLeft: 3 }]);
  });

  it("전부 만료되면 필드째 사라진다", () => {
    const s = newSession();
    s.runStatMods = [{ stat: "str", pct: 5, floorsLeft: 2 }];
    advanceRunModFloors(s, 2);
    expect("runStatMods" in s).toBe(false);
  });
});

describe("stealth — 조우 rng 동일 소비 후 지나침", () => {
  afterEach(() => resetRng());

  /** 같은 시드에서 은신 없이 조우가 나오는 첫 시드를 찾는다. */
  function findEncounterSeed(): number {
    for (let seed = 1; seed <= 200; seed += 1) {
      const s = newSession(2);
      setRngSeed(seed);
      const out = tickSession(s);
      if (out.log[out.log.length - 1]?.type === "encounter") return seed;
    }
    throw new Error("no encounter seed found");
  }

  it("은신 1 → stealthPass 서사, encounter 없음, 시간은 narrative(1)만, 필드 삭제", () => {
    const seed = findEncounterSeed();
    const base = newSession(2);
    setRngSeed(seed);
    const plain = tickSession(base);
    const encounterMonster = (plain.log[plain.log.length - 1] as { monster: { name: string } })
      .monster;

    const stealthy = newSession(2);
    stealthy.runStealthLeft = 1;
    setRngSeed(seed);
    const out = tickSession(stealthy);
    const last = out.log[out.log.length - 1];
    expect(last.type).toBe("narrative");
    expect(narrativesWithKey(out, "uphero.combat.narrative.stealthPass")).toHaveLength(1);
    // 같은 rng 소비 → 같은 몬스터가 "지나친 몬스터" 로 기록된다.
    expect(narrativesWithKey(out, "uphero.combat.narrative.stealthPass")[0].narrativeParams)
      .toMatchObject({ monster: encounterMonster.name });
    expect(out.log.some((e) => e.type === "encounter")).toBe(false);
    expect(out.time).toBe(plain.time + 1);
    expect("runStealthLeft" in out).toBe(false);
  });

  it("보스층은 은신되지 않는다", () => {
    const s = newSession(9);
    s.log.push({ type: "narrative", text: "x", timestamp: Date.now() });
    s.runStealthLeft = 1;
    setRngSeed(5);
    const out = tickSession(s);
    expect(out.log[out.log.length - 1].type).toBe("boss");
    expect(out.runStealthLeft).toBe(1);
  });

  it("stealth 효과는 상한 3 까지 누적", () => {
    setRngSeed(1);
    const s = resolveChoice(armChoice(newSession(), [{ kind: "stealth", encounters: 2 }]), 0);
    expect(s.runStealthLeft).toBe(2);
    const more = resolveChoice(armChoice(s, [{ kind: "stealth", encounters: 2 }]), 0);
    expect(more.runStealthLeft).toBe(RUN_STEALTH_CAP);
  });
});

describe("guaranteedDrop — 드롭 rng 항상 소비 후 강제", () => {
  afterEach(() => resetRng());

  function killSession(floor: number): CombatSession {
    const s = newSession(floor);
    const monster = createMonsterForFloor("fitness", floor, false);
    s.log.push({ type: "encounter", monster, timestamp: Date.now() });
    s.log.push({
      type: "combat",
      attacker: "hero",
      damage: monster.hp,
      outcome: "hit",
      timestamp: Date.now(),
    });
    return s;
  }

  it("드롭이 안 나오는 시드에서도 확정 드롭이 나오고 1 줄어든다", () => {
    setRngSeed(11);
    let seed = 0;
    for (let cand = 1; cand <= 200; cand += 1) {
      setRngSeed(cand);
      const out = tickSession(killSession(5));
      if (!out.log.some((e) => e.type === "drop")) {
        seed = cand;
        break;
      }
    }
    expect(seed).toBeGreaterThan(0);

    setRngSeed(seed);
    const forced = killSession(5);
    forced.runGuaranteedDrops = 2;
    const out = tickSession(forced);
    expect(out.log.filter((e) => e.type === "drop")).toHaveLength(1);
    expect(out.rewards.drops).toHaveLength(1);
    expect(out.runGuaranteedDrops).toBe(1);

    setRngSeed(seed);
    const lastOne = killSession(5);
    lastOne.runGuaranteedDrops = 1;
    const done = tickSession(lastOne);
    expect(done.log.filter((e) => e.type === "drop")).toHaveLength(1);
    expect("runGuaranteedDrops" in done).toBe(false);
  });

  it("guaranteedDrop 효과는 상한 2", () => {
    setRngSeed(1);
    const s = resolveChoice(
      armChoice(newSession(), [{ kind: "guaranteedDrop" }, { kind: "guaranteedDrop", count: 3 }]),
      0,
    );
    expect(s.runGuaranteedDrops).toBe(RUN_GUARANTEED_DROP_CAP);
    expect(lastResult(s)?.effectSummaryData).toEqual({ guaranteedDrop: 4 });
  });
});

describe("revealBoss — 다음 보스 trait 공개 + 보스 피해 %", () => {
  afterEach(() => resetRng());

  it("F12 에서는 F20 보스 (fitness idx 1, shield) 를 밝히고 +5%", () => {
    setRngSeed(1);
    const s = resolveChoice(armChoice(newSession(12), [{ kind: "revealBoss" }]), 0);
    const narr = narrativesWithKey(s, "uphero.combat.narrative.revealBossTrait.shield");
    expect(narr).toHaveLength(1);
    expect(narr[0].narrativeParams).toMatchObject({
      floor: 20,
      monsterTemplateId: "boss_stone_golem",
      pct: 5,
    });
    expect(s.runBossDmgPct).toBe(5);
    expect(lastResult(s)?.effectSummaryData).toEqual({ bossDmgPct: 5 });
  });

  it("세 번 밝히면 15 에서 멈춘다", () => {
    setRngSeed(1);
    let s = newSession(12);
    for (let i = 0; i < 4; i += 1) {
      s = resolveChoice(armChoice(s, [{ kind: "revealBoss" }]), 0);
    }
    expect(s.runBossDmgPct).toBe(RUN_BOSS_DMG_CAP);
  });

  it("F30 에서는 F40 보스 (idx 0, burst) — 보스는 10층마다 영원히", () => {
    setRngSeed(1);
    const s = resolveChoice(armChoice(newSession(30), [{ kind: "revealBoss" }]), 0);
    const narr = narrativesWithKey(s, "uphero.combat.narrative.revealBossTrait.burst");
    expect(narr).toHaveLength(1);
    expect(narr[0].narrativeParams).toMatchObject({
      floor: 40,
      monsterTemplateId: "boss_mountain_wolf",
    });
    expect(narrativesWithKey(s, "uphero.combat.narrative.revealBossNone")).toHaveLength(0);
  });
});

describe("보스 피해 % — executeCombatRound 의 영웅 피해에만", () => {
  afterEach(() => resetRng());

  function bossFight(pct?: number): CombatSession {
    const s = newSession(10);
    const boss = createMonsterForFloor("fitness", 10, true);
    s.log.push({ type: "encounter", monster: boss, timestamp: Date.now() });
    // 보스층 시작은 배너 연출로 paused 다 (Track C) — 전투 라운드를 보려면 재개.
    s.status = "active";
    if (pct) s.runBossDmgPct = pct;
    return s;
  }
  function heroHit(s: CombatSession): number | null {
    for (const e of s.log) {
      if (e.type === "combat" && e.attacker === "hero") return e.damage;
    }
    return null;
  }

  it("runBossDmgPct 15 → 같은 시드의 영웅 피해가 round(×1.15)", () => {
    let seed = 0;
    let baseDmg = 0;
    for (let cand = 1; cand <= 100; cand += 1) {
      setRngSeed(cand);
      const d = heroHit(tickSession(bossFight()));
      if (d && d > 0) {
        seed = cand;
        baseDmg = d;
        break;
      }
    }
    expect(seed).toBeGreaterThan(0);
    setRngSeed(seed);
    expect(heroHit(tickSession(bossFight(15)))).toBe(Math.round(baseDmg * 1.15));
  });

  it("일반 몬스터에는 적용되지 않는다", () => {
    const build = (pct?: number) => {
      const s = newSession(5);
      const m = createMonsterForFloor("fitness", 5, false);
      s.log.push({ type: "encounter", monster: m, timestamp: Date.now() });
      // encounter 직후 일반몹은 선택지가 끼므로 combat 엔트리 하나를 넣어 전투 계속 상태로.
      s.log.push({ type: "combat", attacker: "enemy", damage: 0, outcome: "miss", timestamp: Date.now() });
      if (pct) s.runBossDmgPct = pct;
      return s;
    };
    setRngSeed(7);
    const plain = heroHit(tickSession(build()));
    setRngSeed(7);
    const boosted = heroHit(tickSession(build(15)));
    expect(boosted).toBe(plain);
  });
});

describe("summarizeEffectsData — 새 필드", () => {
  it("런 효과를 모두 담고, 없으면 키를 내지 않는다", () => {
    const d = summarizeEffectsData([
      { kind: "runBuff", stat: "str", pct: 5, floors: 5 },
      { kind: "runCurse", stat: "agi", pct: 5, floors: 3 },
      { kind: "stealth", encounters: 1 },
      { kind: "guaranteedDrop" },
      { kind: "revealBoss" },
      { kind: "skipFloors", count: 2 },
    ]);
    expect(d).toEqual({
      skipFloors: 2,
      runMods: [
        { stat: "str", pct: 5, floors: 5 },
        { stat: "agi", pct: -5, floors: 3 },
      ],
      stealth: 1,
      guaranteedDrop: 1,
      bossDmgPct: 5,
    });
    expect(summarizeEffectsData([{ kind: "reward", xp: 10 }])).toEqual({ xp: 10 });
    expect(summarizeEffects([{ kind: "runCurse", stat: "all", pct: 10, floors: 5 }])).toBe(
      "전 능력치 -10%",
    );
  });
});

describe("scaleChoiceEffectsForFloor — 층·영웅 기준 스케일", () => {
  it("floorRewardScale 표 (NG+0) 와 NG+ 배율, F120 clamp", () => {
    expect(floorRewardScale(1)).toEqual({ coins: 13, xp: 26 });
    expect(floorRewardScale(5)).toEqual({ coins: 34, xp: 50 });
    expect(floorRewardScale(10)).toEqual({ coins: 60, xp: 80 });
    expect(floorRewardScale(15)).toEqual({ coins: 66, xp: 110 });
    expect(floorRewardScale(20)).toEqual({ coins: 86, xp: 140 });
    expect(floorRewardScale(25)).toEqual({ coins: 106, xp: 170 });
    expect(floorRewardScale(30)).toEqual({ coins: 126, xp: 200 });
    expect(floorRewardScale(30, 1)).toEqual({ coins: 176, xp: 280 });
    expect(floorRewardScale(200)).toEqual(floorRewardScale(120));
    expect(floorRewardScale(0)).toEqual(floorRewardScale(1));
    expect(choiceRewardMult(1)).toEqual({ coin: 1, xp: 26 / 15 });
  });

  it("보상 35/15, 피해 15, 회복 20 → F20 maxHp 388: 60/140, 58, 78. 구조 효과는 통과", () => {
    const effects: ChoiceEffect[] = [
      { kind: "reward", coins: 35, xp: 15 },
      { kind: "damage", amount: 15 },
      { kind: "heal", amount: 20 },
      { kind: "time", delta: -3 },
      { kind: "spinSlot", cost: 30 },
      { kind: "fight" },
      { kind: "flee", successChance: 0.5 },
      { kind: "runBuff", stat: "str", pct: 5, floors: 5 },
    ];
    expect(scaleChoiceEffectsForFloor(effects, 20, 388)).toEqual([
      { kind: "reward", coins: 60, xp: 140 },
      { kind: "damage", amount: 58 },
      { kind: "heal", amount: 78 },
      { kind: "time", delta: -3 },
      { kind: "spinSlot", cost: 30 },
      { kind: "fight" },
      { kind: "flee", successChance: 0.5 },
      { kind: "runBuff", stat: "str", pct: 5, floors: 5 },
    ]);
    expect(scaleChoiceEffectsForFloor(effects.slice(0, 2), 1, 100)).toEqual([
      { kind: "reward", coins: 35, xp: 26 },
      { kind: "damage", amount: 15 },
    ]);
    expect(scaleChoiceEffectsForFloor([{ kind: "reward", xp: 15 }], 10, 100)).toEqual([
      { kind: "reward", xp: 80 },
    ]);
  });

  it("resolveChoice 는 스케일된 수치를 요약·지급한다 (F20, xp 15 → 140)", () => {
    setRngSeed(1);
    const s = newSession(20);
    const before = s.rewards.xp;
    const out = resolveChoice(armChoice(s, [{ kind: "reward", xp: 15 }]), 0);
    expect(lastResult(out)?.effectSummaryData).toEqual({ xp: 140 });
    expect(out.rewards.xp - before).toBe(140);
    resetRng();
  });
});

describe("buildSummaryChips — 효과마다 칩 하나 (ko / en)", () => {
  beforeAll(async () => {
    await ensureLanguage("en");
  });

  const data = {
    xp: 26,
    skipFloors: 2,
    runMods: [
      { stat: "str" as const, pct: 5, floors: 5 },
      { stat: "agi" as const, pct: -5 },
      { stat: "all" as const, pct: 3, floors: 5 },
    ],
    stealth: 1,
    guaranteedDrop: 1,
    bossDmgPct: 5,
  };

  it("ko", () => {
    const chips = buildSummaryChips(
      data,
      (k: DictKey, p?: Record<string, string | number>) => t(k, "ko", p),
      (s) => affixStatLabel(s, "ko"),
    );
    expect(chips).toEqual([
      "경험치 +26",
      "2층 건너뜀",
      "힘 +5% (5층)",
      "민첩 -5% (이번 탐험)",
      "전 능력치 +3% (5층)",
      "다음 1회 조우 회피",
      "다음 처치 장비 확정 x1",
      "보스 피해 +5%",
    ]);
  });

  it("en", () => {
    const chips = buildSummaryChips(
      data,
      (k: DictKey, p?: Record<string, string | number>) => t(k, "en", p),
      (s) => affixStatLabel(s, "en"),
    );
    expect(chips).toEqual([
      "XP +26",
      "Skipped 2 floors",
      "Str +5% (5 floors)",
      "Agi -5% (this run)",
      "All stats +3% (5 floors)",
      "Avoid next 1 encounters",
      "Guaranteed gear on next kill x1",
      "Boss damage +5%",
    ]);
  });
});
