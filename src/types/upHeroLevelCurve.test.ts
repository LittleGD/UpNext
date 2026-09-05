import { describe, it, expect } from "vitest";
import {
  HERO_LEVEL_CAP,
  HERO_XP_CAP,
  HERO_XP_GAP_A,
  HERO_XP_GAP_B,
  HERO_XP_GAP_C,
  heroXpToNextLevel,
  heroTotalXPForLevel,
  heroLevelFromXP,
  getHeroXPProgress,
  skillPointsTotalForLevel,
  bossClearXp,
  floorXp,
  resolveHeroLevel,
  clampHeroXp,
  ngPlusScaleMult,
} from "./uphero";
import { BOSS_XP_MULT } from "@/data/upHeroMonsters";

/**
 * Phase 2-A (Track A) — 영웅 XP 곡선 회귀 테스트.
 *
 * 곡선은 gap(L) = L^2 + 120, total(L) = n(n+1)(2n+1)/6 + 120n (n = L-1).
 * 아래 표는 iOS UpHeroLevelCurveTests 가 그대로 하드코딩하는 정본이다 — 값이
 * 바뀌면 두 쪽을 같이 고친다 (scripts/verify-equivalence.sh uphero 섹션 13-17 도).
 *
 *   L :   1  2    5    10    20    22    30    40    45    47    50    60    100     999
 *   XP:   0  121  510  1365  4750  5831  12035 25220 34650 39031 46305 77290 340230  331,955,259
 */
const TABLE: Array<[number, number]> = [
  [1, 0],
  [2, 121],
  [5, 510],
  [10, 1365],
  [20, 4750],
  [22, 5831],
  [30, 12035],
  [40, 25220],
  [45, 34650],
  [47, 39031],
  [50, 46305],
  [60, 77290],
  [100, 340230],
  [999, 331955259],
];

describe("영웅 XP 곡선 — 표", () => {
  it("상수는 플랜 확정값 1/0/120, cap 999", () => {
    expect([HERO_XP_GAP_A, HERO_XP_GAP_B, HERO_XP_GAP_C]).toEqual([1, 0, 120]);
    expect(HERO_LEVEL_CAP).toBe(999);
    expect(HERO_XP_CAP).toBe(331955259);
    expect(HERO_XP_CAP).toBe(heroTotalXPForLevel(HERO_LEVEL_CAP));
  });

  it.each(TABLE)("heroTotalXPForLevel(%i) = %i", (level, total) => {
    expect(heroTotalXPForLevel(level)).toBe(total);
  });

  it("gap(1)=121, gap(30)=1020, gap(40)=1720", () => {
    expect(heroXpToNextLevel(1)).toBe(121);
    expect(heroXpToNextLevel(30)).toBe(1020);
    expect(heroXpToNextLevel(40)).toBe(1720);
  });

  it("닫힌 형식 == gap 누적 합 (L = 1..300), 전부 정수", () => {
    let acc = 0;
    for (let L = 1; L <= 300; L += 1) {
      expect(heroTotalXPForLevel(L)).toBe(acc);
      expect(Number.isInteger(heroTotalXPForLevel(L))).toBe(true);
      acc += heroXpToNextLevel(L);
    }
  });
});

describe("영웅 XP 곡선 — 역함수 / 상한 / clamp", () => {
  it("heroLevelFromXP(total(L)) == L, total(L)-1 → L-1 (L = 2..200)", () => {
    for (let L = 2; L <= 200; L += 1) {
      const total = heroTotalXPForLevel(L);
      expect(heroLevelFromXP(total)).toBe(L);
      expect(heroLevelFromXP(total - 1)).toBe(L - 1);
    }
  });

  it("역함수 스팟: 120→1, 121→2, 509→4, 510→5, 39,031→47", () => {
    expect(heroLevelFromXP(120)).toBe(1);
    expect(heroLevelFromXP(121)).toBe(2);
    expect(heroLevelFromXP(509)).toBe(4);
    expect(heroLevelFromXP(510)).toBe(5);
    expect(heroLevelFromXP(39031)).toBe(47);
  });

  it("상한: 1e12 → 999, cap 자체 → 999", () => {
    expect(heroLevelFromXP(1e12)).toBe(HERO_LEVEL_CAP);
    expect(heroLevelFromXP(HERO_XP_CAP)).toBe(HERO_LEVEL_CAP);
  });

  it("순수 함수는 입력을 접는다 — 비유한/음수 XP → 0, 레벨 → [1, cap]", () => {
    expect(heroLevelFromXP(NaN)).toBe(1);
    expect(heroLevelFromXP(-1)).toBe(1);
    expect(heroLevelFromXP(Infinity)).toBe(1); // 비유한은 0 으로 접힌다 (clampHeroXp 계약)
    expect(clampHeroXp(NaN)).toBe(0);
    expect(clampHeroXp(-5)).toBe(0);
    expect(clampHeroXp(12.9)).toBe(12);
    expect(clampHeroXp(1e15)).toBe(HERO_XP_CAP);
    expect(heroTotalXPForLevel(1000)).toBe(heroTotalXPForLevel(999));
    expect(heroTotalXPForLevel(0)).toBe(0);
    expect(heroTotalXPForLevel(NaN)).toBe(0);
    expect(heroXpToNextLevel(0)).toBe(heroXpToNextLevel(1));
    expect(heroXpToNextLevel(1000)).toBe(heroXpToNextLevel(999));
  });

  it("getHeroXPProgress — 레벨 안 진행도", () => {
    expect(getHeroXPProgress(0, 1)).toEqual({ current: 0, needed: 121 });
    expect(getHeroXPProgress(39031, 47)).toEqual({ current: 0, needed: 2329 });
    expect(getHeroXPProgress(5000, 10)).toEqual({ current: 3635, needed: 220 });
    // 음수/비유한 XP 도 0 으로 접힌다.
    expect(getHeroXPProgress(-100, 3).current).toBe(0);
  });
});

describe("스킬 포인트 총량", () => {
  it("Lv30 까지 0, Lv31 부터 레벨당 1, cap 에서 멈춤", () => {
    expect(skillPointsTotalForLevel(1)).toBe(0);
    expect(skillPointsTotalForLevel(29)).toBe(0);
    expect(skillPointsTotalForLevel(30)).toBe(0);
    expect(skillPointsTotalForLevel(31)).toBe(1);
    expect(skillPointsTotalForLevel(35)).toBe(5);
    expect(skillPointsTotalForLevel(45)).toBe(15);
    expect(skillPointsTotalForLevel(999)).toBe(969);
    expect(skillPointsTotalForLevel(1000)).toBe(969);
    expect(skillPointsTotalForLevel(NaN)).toBe(0);
  });
});

describe("XP 소스 — 보스 처치 보너스 / 층 진입", () => {
  it("bossClearXp(f, ng) = round(f × 20 × ngMult)", () => {
    expect(bossClearXp(10, 0)).toBe(200);
    expect(bossClearXp(20, 0)).toBe(400);
    expect(bossClearXp(30, 0)).toBe(600);
    expect(bossClearXp(30, 1)).toBe(840);
    expect(bossClearXp(45, 1)).toBe(1260);
    expect(bossClearXp(1, undefined)).toBe(20);
  });

  it("floorXp(f, ng) = round((5 + f) × ngMult)", () => {
    expect(floorXp(1, 0)).toBe(6);
    expect(floorXp(30, 0)).toBe(35);
    expect(floorXp(45, 1)).toBe(70);
    expect(floorXp(60, 2)).toBe(117);
    expect(floorXp(10, undefined)).toBe(15);
  });
});

describe("resolveHeroLevel — 시드 전 폴백", () => {
  it("heroXp 가 undefined 면 레거시 공식, 있으면 곡선 역함수", () => {
    expect(resolveHeroLevel(undefined, 47, 1)).toBe(47);
    expect(resolveHeroLevel(undefined, 43, 41)).toBe(3);
    expect(resolveHeroLevel(0, 47, 1)).toBe(1);
    expect(resolveHeroLevel(245, 47, 41)).toBe(3);
    expect(resolveHeroLevel(39031, 47, 1)).toBe(47);
  });
});

/**
 * 페이싱 — A 의 수입 모델 (플랜 "Phase 2-A"): 30 층 사이클마다 power-2 잡몹 15 처치
 * + 보스 3 (10 층마다, Track C 케이던스) + 층 진입 XP. xpMult(카드/클래스/주간) 적용 전.
 *   몬스터 XP 는 upHeroMonsters.scaleMonster 의 현재 공식 그대로:
 *   round((10 + f×3) × power × (boss ? BOSS_XP_MULT : 1) × ngMult).
 *   사이클1 = F1-30 NG+0 → Lv22, 누적 사이클2 = F31-60 NG+1 → Lv40.
 *   이 창이 깨지면 곡선(HERO_XP_GAP_*)이나 보스/층 XP 상수가 움직인 것이다.
 */
function killXp(floor: number, power: number, boss: boolean, ng: number): number {
  return Math.round(
    (10 + floor * 3) * power * (boss ? BOSS_XP_MULT : 1) * ngPlusScaleMult(ng),
  );
}

/** 사이클 안 잡몹 처치 층 (오프셋 1..30, 보스층 10/20/30 제외) — 짝수 12 + 5/15/25. */
const TRASH_OFFSETS = [2, 4, 6, 8, 12, 14, 16, 18, 22, 24, 26, 28, 5, 15, 25];

function cycleIncome(startFloor: number, ng: number): number {
  const endFloor = startFloor + 29;
  let xp = 0;
  for (const off of TRASH_OFFSETS) xp += killXp(startFloor + off - 1, 2, false, ng);
  // 보스 3 (power 3) + 처치 보너스.
  for (let f = startFloor; f <= endFloor; f += 1) {
    if (f % 10 === 0) xp += killXp(f, 3, true, ng) + bossClearXp(f, ng);
  }
  // 층 진입 XP — 첫 층은 진입이 아니라 시작이라 제외.
  for (let f = startFloor + 1; f <= endFloor; f += 1) xp += floorXp(f, ng);
  return xp;
}

describe("페이싱 (보스 10층마다, xpMult 전)", () => {
  it("사이클1 (F1-30, NG+0) → Lv 21..23", () => {
    const c1 = cycleIncome(1, 0);
    const lv = heroLevelFromXP(c1);
    expect(lv).toBeGreaterThanOrEqual(21);
    expect(lv).toBeLessThanOrEqual(23);
  });

  it("누적 사이클2 (F31-60, NG+1) → Lv 39..41", () => {
    const cum = cycleIncome(1, 0) + cycleIncome(31, 1);
    const lv = heroLevelFromXP(cum);
    expect(lv).toBeGreaterThanOrEqual(39);
    expect(lv).toBeLessThanOrEqual(41);
  });
});
