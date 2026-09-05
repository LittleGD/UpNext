import { describe, it, expect, afterEach } from "vitest";
import {
  ALL_MONSTER_TEMPLATES,
  BOSS_ATK_MULT_BY_CYCLE,
  BOSS_HP_MULT_BY_CYCLE,
  BOSS_XP_MULT,
  POWER_ATK_DEF_MULT,
  POWER_WEIGHTS_BY_FLOOR,
  bossCycleIndex,
  createMonsterForFloor,
  powerWeightBand,
  scaleMonster,
} from "./upHeroMonsters";
import { DUNGEON_LIST, DUNGEONS } from "./upHeroDungeons";
import { createSession, tickSession, BOSS_REGEN_PCT } from "@/lib/upHeroCombat";
import { setRngSeed, resetRng } from "@/lib/upHeroRng";
import {
  computeHeroForLevel,
  createDefaultHero,
  type DungeonId,
  type Hero,
} from "@/types/uphero";

/**
 * Phase 16 (Track C) — 몬스터 스케일 픽스처 + 기준 영웅 보스 시뮬레이션.
 *
 * 픽스처 숫자는 iOS UpHeroSessionLoopTests.swift 가 그대로 단언한다 (1:1 미러).
 * 시뮬레이션은 8 던전 × 시드 1..25 = 200 런. 목표: F10/F20 ≥ 80%, F30 ≥ 55%,
 * 뒤 사이클도 같은 기준 (F40/F50 ≥ 80%, F60 ≥ 55%). 측정값은
 * upHeroMonsters.ts BOSS_HP_MULT_BY_CYCLE 주석에 기록돼 있다.
 */

const tmpl = (id: string) => {
  const t = ALL_MONSTER_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`template ${id}`);
  return t;
};

describe("scaleMonster 픽스처 (iOS 와 공유)", () => {
  it("상수 계약", () => {
    expect(BOSS_HP_MULT_BY_CYCLE).toEqual([1.2, 1.0, 0.9, 0.85]);
    expect(BOSS_ATK_MULT_BY_CYCLE).toEqual([0.9, 0.8, 0.75, 0.7]);
    expect(BOSS_XP_MULT).toBe(4);
    expect(POWER_ATK_DEF_MULT).toEqual({ 1: 1, 2: 1.6, 3: 2.2 });
    expect(POWER_WEIGHTS_BY_FLOOR).toEqual([
      { 1: 70, 2: 30, 3: 0 },
      { 1: 50, 2: 40, 3: 10 },
      { 1: 35, 2: 45, 3: 20 },
      { 1: 25, 2: 45, 3: 30 },
    ]);
  });

  it("bossCycleIndex / powerWeightBand", () => {
    expect(bossCycleIndex(10)).toBe(0);
    expect(bossCycleIndex(30)).toBe(0);
    expect(bossCycleIndex(31)).toBe(1);
    expect(bossCycleIndex(60)).toBe(1);
    expect(bossCycleIndex(90)).toBe(2);
    expect(bossCycleIndex(120)).toBe(3);
    expect(powerWeightBand(10)).toBe(0);
    expect(powerWeightBand(11)).toBe(1);
    expect(powerWeightBand(20)).toBe(1);
    expect(powerWeightBand(21)).toBe(2);
    expect(powerWeightBand(30)).toBe(2);
    expect(powerWeightBand(31)).toBe(3);
  });

  it("boss_river_naiad F20 → hp 432 atk 61 def 26 xp 840 coin 1290", () => {
    const m = scaleMonster(tmpl("boss_river_naiad"), "wellness", 20);
    expect([m.hp, m.maxHp, m.atk, m.def, m.xpReward, m.coinReward]).toEqual([432, 432, 61, 26, 840, 1290]);
  });

  it("boss_mountain_wolf F10 → hp 189 atk 27 def 12", () => {
    const m = scaleMonster(tmpl("boss_mountain_wolf"), "fitness", 10);
    expect([m.hp, m.atk, m.def]).toEqual([189, 27, 12]);
  });

  it("boss_stone_golem F30 → hp 612 atk 87 def 37", () => {
    // trait shield 는 스탯을 건드리지 않는다.
    const m = scaleMonster(tmpl("boss_stone_golem"), "fitness", 30);
    expect([m.hp, m.atk, m.def]).toEqual([612, 87, 37]);
  });

  it("boss_mountain_wolf F40 (cycle 1) → hp 660 atk 100 def 48", () => {
    const m = scaleMonster(tmpl("boss_mountain_wolf"), "fitness", 40);
    expect([m.hp, m.atk, m.def]).toEqual([660, 100, 48]);
  });

  it("boss_stone_golem F60 (cycle 1) → hp 960 atk 146 def 70", () => {
    const m = scaleMonster(tmpl("boss_stone_golem"), "fitness", 60);
    expect([m.hp, m.atk, m.def]).toEqual([960, 146, 70]);
  });

  it("보스 NG+2 는 ngMult 가 여전히 곱해진다", () => {
    const m = scaleMonster(tmpl("boss_mountain_wolf"), "fitness", 10, { ngPlusLevel: 2 });
    // 189 × 1.8 = 340.2 → 340
    expect(m.hp).toBe(340);
  });

  it("fit_eagle (power 2) F15 → hp 190 atk 39 def 15", () => {
    const m = scaleMonster(tmpl("fit_eagle"), "fitness", 15);
    expect([m.hp, m.atk, m.def]).toEqual([190, 39, 15]);
  });

  it("fit_golem (power 3) F25 → hp 435 atk 83 def 32", () => {
    const m = scaleMonster(tmpl("fit_golem"), "fitness", 25);
    expect([m.hp, m.atk, m.def]).toEqual([435, 83, 32]);
  });

  it("fit_wolf (power 1) F5 → hp 34 atk 9 def 3", () => {
    const m = scaleMonster(tmpl("fit_wolf"), "fitness", 5);
    expect([m.hp, m.atk, m.def]).toEqual([34, 9, 3]);
  });
});

describe("createMonsterForFloor — 보스 사이클 인덱스", () => {
  it.each([
    [10, 0],
    [20, 1],
    [30, 2],
    [40, 0],
    [50, 1],
    [60, 2],
    [90, 2],
    [100, 0],
  ])("F%i → bossIds[%i]", (floor, idx) => {
    for (const d of DUNGEON_LIST) {
      const m = createMonsterForFloor(d.id, floor, true);
      expect(m.templateId).toBe(DUNGEONS[d.id].bossIds[idx]);
      expect(m.isBoss).toBe(true);
      expect(m.level).toBe(floor);
    }
  });

  it("보스 생성은 rng 를 소비하지 않는다 (revealBoss 미리보기 안전)", () => {
    setRngSeed(7);
    createMonsterForFloor("fitness", 40, true);
    const a = createMonsterForFloor("fitness", 15, false);
    setRngSeed(7);
    const b = createMonsterForFloor("fitness", 15, false);
    resetRng();
    expect(a.templateId).toBe(b.templateId);
  });
});

describe("createMonsterForFloor — power 가중치", () => {
  afterEach(() => resetRng());

  function powerShare(dungeonId: DungeonId, floor: number, runs: number) {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (let seed = 1; seed <= runs; seed++) {
      setRngSeed(seed);
      const m = createMonsterForFloor(dungeonId, floor, false);
      const t = tmpl(m.templateId ?? "");
      counts[t.power] += 1;
    }
    return counts;
  }

  it("F8 (500 런) 에서 power 3 은 절대 나오지 않는다", () => {
    const c = powerShare("fitness", 8, 500);
    expect(c[3]).toBe(0);
    expect(c[1]).toBeGreaterThan(c[2]);
  });

  it("F35 (500 런) 에서 power 3 비중은 20~40%", () => {
    const c = powerShare("fitness", 35, 500);
    const share = c[3] / 500;
    expect(share).toBeGreaterThanOrEqual(0.2);
    expect(share).toBeLessThanOrEqual(0.4);
  });

  it("F1-3 은 newbie 풀만", () => {
    for (let seed = 1; seed <= 50; seed++) {
      setRngSeed(seed);
      const m = createMonsterForFloor("learning", 2, false);
      expect(tmpl(m.templateId ?? "").isNewbie).toBe(true);
    }
  });

  it("시드가 같으면 같은 템플릿 (결정론)", () => {
    setRngSeed(99);
    const a = createMonsterForFloor("social", 22, false).templateId;
    setRngSeed(99);
    const b = createMonsterForFloor("social", 22, false).templateId;
    expect(a).toBe(b);
  });
});

/* ── 기준 영웅 보스 시뮬레이션 ─────────────────────────────────────── */

interface RefRow {
  floor: number;
  level: number;
  enh: number;
  rarityMult: number;
  minWin: number;
}

/** 공통 규칙 §2 기준 영웅표. rare ×1.5, unique ×2.0. */
const REFERENCE: RefRow[] = [
  { floor: 10, level: 8, enh: 0, rarityMult: 1.5, minWin: 0.8 },
  { floor: 20, level: 16, enh: 0, rarityMult: 1.5, minWin: 0.8 },
  { floor: 30, level: 22, enh: 5, rarityMult: 1.5, minWin: 0.55 },
  { floor: 40, level: 29, enh: 5, rarityMult: 1.5, minWin: 0.8 },
  { floor: 50, level: 35, enh: 10, rarityMult: 1.5, minWin: 0.8 },
  { floor: 60, level: 40, enh: 10, rarityMult: 1.5, minWin: 0.55 },
];

/** gear = round((5+0.5f)×rarity) + floor(min(enh,10)/2) + max(0, enh-10). */
export function referenceGear(floor: number, enh: number, rarityMult: number): number {
  return (
    Math.round((5 + 0.5 * floor) * rarityMult) +
    Math.floor(Math.min(enh, 10) / 2) +
    Math.max(0, enh - 10)
  );
}

export function referenceHero(row: Pick<RefRow, "floor" | "level" | "enh" | "rarityMult">): Hero {
  const base = computeHeroForLevel(createDefaultHero("ko"), row.level);
  const gear = referenceGear(row.floor, row.enh, row.rarityMult);
  return {
    ...base,
    baseStats: {
      ...base.baseStats,
      str: base.baseStats.str + gear,
      vit: base.baseStats.vit + gear,
    },
  };
}

/** 보스층에서 시작해 보스 승리 / 사망까지 tick. 승리 = victory(isBoss) 엔트리. */
export function simulateBossFight(
  dungeonId: DungeonId,
  row: Pick<RefRow, "floor" | "level" | "enh" | "rarityMult">,
  seed: number,
): boolean {
  setRngSeed(seed);
  let s = createSession(dungeonId, referenceHero(row), row.floor, undefined, {
    heroLevel: row.level,
  });
  s = { ...s, status: "active" };
  for (let i = 0; i < 2000; i++) {
    s = tickSession(s);
    if (s.log.some((e) => e.type === "victory" && e.monster.isBoss)) return true;
    if (s.status === "completed") return false;
  }
  return false;
}

describe("기준 영웅 보스 시뮬레이션 (8 던전 × 25 시드)", () => {
  afterEach(() => resetRng());

  it("기준 영웅 스탯표", () => {
    const h10 = referenceHero(REFERENCE[0]);
    expect([h10.baseStats.str, h10.baseStats.vit, h10.maxHp]).toEqual([32, 32, 184]);
    const h20 = referenceHero(REFERENCE[1]);
    expect([h20.baseStats.str, h20.maxHp]).toEqual([48, 280]);
    const h30 = referenceHero(REFERENCE[2]);
    expect([h30.baseStats.str, h30.maxHp]).toEqual([63, 352]);
  });

  it("regen 보스 상수는 시뮬 전제 (1%)", () => {
    expect(BOSS_REGEN_PCT).toBe(0.01);
  });

  for (const row of REFERENCE) {
    it(`F${row.floor} Lv${row.level} rare+${row.enh}: 승률 ≥ ${row.minWin * 100}%`, () => {
      let wins = 0;
      let runs = 0;
      for (const d of DUNGEON_LIST) {
        for (let seed = 1; seed <= 25; seed++) {
          runs += 1;
          if (simulateBossFight(d.id, row, seed)) wins += 1;
        }
      }
      expect(runs).toBe(200);
      expect(wins / runs).toBeGreaterThanOrEqual(row.minWin);
    });
  }
});
