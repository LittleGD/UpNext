import { describe, it, expect, afterEach } from "vitest";
import { createSession, tickSession, resolveChoice, sessionXpMult } from "./upHeroCombat";
import { setRngSeed, resetRng } from "./upHeroRng";
import {
  createDefaultHero,
  bossClearXp,
  floorXp,
  type CombatSession,
  type Hero,
} from "@/types/uphero";

/**
 * Phase 2-A (Track A, 피드백 20) — 세션 XP 소스 회귀 테스트.
 *
 *  - 보스 처치 victory 엔트리의 xp = round((xpReward + bossClearXp(층, NG+)) × xpMult)
 *  - 잡몹 victory 는 기존 공식 그대로 round(xpReward × xpMult)
 *  - 층 진입마다 rewards.xp += round(floorXp(층, NG+) × xpMult) — 처치와 같은 배율
 *
 * 로그 엔트리 종류는 늘지 않는다 (iOS 디코더 불변). 세션 결과는 모두 영웅 XP 풀로
 * 정산된다 (useUpHeroStore.acknowledgeSessionEnd → settleHeroXp).
 */

/** 한 방에 죽이고 절대 죽지 않는 영웅 — 전투를 결정론적으로 짧게. */
function juggernaut(): Hero {
  const h = createDefaultHero("ko");
  return {
    ...h,
    hp: 999999,
    maxHp: 999999,
    baseStats: { ...h.baseStats, str: 5000, vit: 5000, dex: 200, agi: 200 },
  };
}

function victories(s: CombatSession) {
  return s.log.filter((e) => e.type === "victory");
}

/** 잡몹 조우마다 끼어드는 "싸운다/도망" 선택지인가 (option 0 = fight, XP 없음). */
function isEncounterChoice(s: CombatSession): boolean {
  if (s.status !== "awaitingChoice" || s.pendingChoiceIndex === undefined) return false;
  const e = s.log[s.pendingChoiceIndex];
  return e?.type === "choice" && e.options[0]?.effect?.kind === "fight";
}

/**
 * 보스 배너는 세션을 paused 로 세운다 (유저가 재개) — 곧장 재개한다.
 * 조우 선택지는 항상 "싸운다" — 전투 XP 만 생기고 선택 보상 XP 는 없다.
 * 그 밖의 이벤트 선택지/미니게임에서 멈추면 그 런은 끝 (선택 보상 XP 가 합계 불변식을
 * 흐리지 않게).
 */
function step(s: CombatSession): CombatSession {
  if (isEncounterChoice(s)) return resolveChoice(s, 0);
  const cur = s.status === "paused" ? { ...s, status: "active" as const } : s;
  return tickSession(cur, { slotSpinsToday: 0 });
}

function canStep(s: CombatSession): boolean {
  return s.status === "active" || s.status === "paused" || isEncounterChoice(s);
}

function run(s: CombatSession, ticks: number): CombatSession {
  let cur = s;
  for (let i = 0; i < ticks; i += 1) {
    if (!canStep(cur)) break;
    cur = step(cur);
  }
  return cur;
}

describe("보스 처치 보너스", () => {
  afterEach(() => resetRng());

  it.each([0, 1, 2])("NG+%i — 보스 victory xp 에 bossClearXp 가 합산된다", (ng) => {
    setRngSeed(4242 + ng);
    // F10 에서 시작하면 createSession 이 보스를 바로 스폰한다.
    let s = createSession("fitness", juggernaut(), 10, undefined, { ngPlusLevel: ng });
    s = run(s, 40);
    const boss = victories(s).find((e) => e.monster.isBoss);
    expect(boss).toBeDefined();
    if (!boss) return;
    const mult = sessionXpMult(s);
    expect(boss.monster.level).toBe(10);
    expect(boss.xp).toBe(
      Math.round((boss.monster.xpReward + bossClearXp(10, ng)) * mult),
    );
    // 보너스는 실제로 0 이 아니다 (합산이 빠지면 여기서 잡힌다).
    expect(boss.xp).toBeGreaterThan(Math.round(boss.monster.xpReward * mult));
  });

  it("잡몹 victory 는 기존 공식 그대로 (보너스 없음)", () => {
    let found = 0;
    for (let seed = 1; seed <= 20 && found === 0; seed += 1) {
      setRngSeed(seed);
      let s = createSession("learning", juggernaut(), 1);
      s = run(s, 60);
      const mult = sessionXpMult(s);
      for (const v of victories(s)) {
        if (v.monster.isBoss) continue;
        expect(v.xp).toBe(Math.round(v.monster.xpReward * mult));
        found += 1;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe("층 진입 XP", () => {
  afterEach(() => resetRng());

  it("층이 오를 때마다 rewards.xp 가 round(floorXp × sessionXpMult) 만큼 는다", () => {
    let floorsSeen = 0;
    for (let seed = 100; seed <= 160 && floorsSeen < 3; seed += 1) {
      setRngSeed(seed);
      let s = createSession("mindfulness", juggernaut(), 1, undefined, { ngPlusLevel: 1 });
      for (let i = 0; i < 80 && canStep(s); i += 1) {
        const before = s.rewards.xp;
        const floorBefore = s.currentFloor;
        const logBefore = s.log.length;
        s = step(s);
        if (s.currentFloor === floorBefore) continue;
        // 층 전환 틱: floor 엔트리가 붙고, 같은 틱엔 victory 가 없다.
        const added = s.log.slice(logBefore);
        expect(added.some((e) => e.type === "floor" && e.to === s.currentFloor)).toBe(true);
        expect(added.some((e) => e.type === "victory")).toBe(false);
        expect(s.rewards.xp - before).toBe(
          Math.round(floorXp(s.currentFloor, 1) * sessionXpMult(s)),
        );
        floorsSeen += 1;
      }
    }
    expect(floorsSeen).toBeGreaterThanOrEqual(3);
  });

  it("세션 XP 합계 = Σ victory.xp + Σ 층 진입 XP (다른 소스 없음)", () => {
    let checked = 0;
    for (let seed = 777; seed < 800 && checked < 5; seed += 1) {
      setRngSeed(seed);
      let s = createSession("nutrition", juggernaut(), 1);
      s = run(s, 60);
      if (s.rewards.xp === 0) continue;
      const mult = sessionXpMult(s);
      let expected = 0;
      for (const e of s.log) {
        if (e.type === "victory") expected += e.xp;
        // createSession 의 시작 층 엔트리(from 0)는 진입이 아니다 — XP 없음.
        if (e.type === "floor" && e.from > 0) expected += Math.round(floorXp(e.to, 0) * mult);
      }
      expect(s.rewards.xp).toBe(expected);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("sessionXpMult — 카드 버프 × 클래스(mage +20%) × 주간 affix 한 곳", () => {
    const base = createSession("fitness", juggernaut(), 1);
    expect(sessionXpMult(base)).toBe(1);
    const mage = createSession("learning", { ...juggernaut(), classType: "mage" }, 1);
    expect(sessionXpMult(mage)).toBeCloseTo(1.2, 10);
    const weekly = { ...base, xpMult: 0.75 } as CombatSession;
    expect(sessionXpMult(weekly)).toBeCloseTo(0.75, 10);
  });
});
