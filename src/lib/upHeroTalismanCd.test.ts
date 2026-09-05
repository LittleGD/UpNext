import { describe, it, expect, afterEach } from "vitest";
import { createSession, tickSession, resolveChoice } from "./upHeroCombat";
import { setRngSeed, resetRng } from "./upHeroRng";
import { emptyTalismanMods } from "./talismanSkills";
import { findSkillById } from "./classSkills";
import { createDefaultHero, type CombatSession, type Hero } from "@/types/uphero";

/**
 * Phase 6-E (Track E, 피드백 21) — 평정 (mnd_5, classSkillCdReduce) 이 스킬별 쿨다운
 * 맵(`skillCooldowns`) 을 실제로 줄인다. 이전엔 표시용 스칼라 `skillCooldown` 만 줄여
 * canFireSkill / SkillBar 가 읽는 맵에는 아무 효과가 없었다.
 *
 * 같은 시드로 두 번 돌려 스킬이 처음 발동한 tick 직후의 맵 값을 비교한다: reduce 1 이면
 * 정확히 1 작다 (이후 라운드 끝의 -1 은 양쪽에 똑같이 적용된다).
 */

/** 한 방에 죽이고 절대 죽지 않는 영웅 + novice_focus (조우마다 발동, cooldown 5). */
function hero(): Hero {
  const h = createDefaultHero("ko");
  return {
    ...h,
    hp: 999999,
    maxHp: 999999,
    baseStats: { ...h.baseStats, str: 5000, vit: 5000, dex: 200, agi: 200 },
    learnedSkills: ["novice_focus"],
    autoSkillEnabled: true,
  };
}

/** 조우는 "싸운다", 그 밖의 선택지도 0번으로 — 쿨다운만 보므로 보상은 무관하다. */
function step(s: CombatSession): CombatSession {
  if (s.status === "awaitingChoice") return resolveChoice(s, 0);
  const cur = s.status === "paused" ? { ...s, status: "active" as const } : s;
  return tickSession(cur, { slotSpinsToday: 0 });
}

function canStep(s: CombatSession): boolean {
  return s.status === "active" || s.status === "paused" || s.status === "awaitingChoice";
}

/** 스킬이 처음 발동한 tick 직후의 세션 (없으면 null). */
function runUntilSkillFires(reduce: number, seed: number): CombatSession | null {
  setRngSeed(seed);
  let s = createSession("fitness", hero(), 1);
  s.talismanMods = { ...emptyTalismanMods(), classSkillCdReduce: reduce };
  for (let i = 0; i < 400; i += 1) {
    if (!canStep(s)) break;
    const before = s.log.filter((e) => e.type === "skill" && e.skillId === "novice_focus").length;
    s = step(s);
    const after = s.log.filter((e) => e.type === "skill" && e.skillId === "novice_focus").length;
    if (after > before) return s;
  }
  return null;
}

/** 미니게임 등에 막히지 않고 스킬이 발동하는 첫 시드. */
function findSeed(): number {
  for (let seed = 1; seed <= 40; seed += 1) {
    if (runUntilSkillFires(0, seed)) return seed;
  }
  throw new Error("no seed fires novice_focus within 40 tries");
}

describe("평정 — skillCooldowns 맵 diff", () => {
  afterEach(() => resetRng());

  const cooldown = findSkillById("novice_focus")!.cooldown;
  const SEED = findSeed();

  it("reduce 0: 발동 tick 뒤 맵 값 = cooldown - 1 (라운드 끝 -1)", () => {
    const s = runUntilSkillFires(0, SEED);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.skillCooldowns?.novice_focus).toBe(cooldown - 1);
  });

  it("reduce 1: 같은 시드에서 정확히 1 작다, 0 아래로 내려가지 않는다", () => {
    const base = runUntilSkillFires(0, SEED);
    const reduced = runUntilSkillFires(1, SEED);
    expect(base).not.toBeNull();
    expect(reduced).not.toBeNull();
    if (!base || !reduced) return;
    expect(reduced.skillCooldowns?.novice_focus).toBe(
      (base.skillCooldowns?.novice_focus ?? 0) - 1,
    );
    // 스칼라(표시용) 도 여전히 줄어든다 (legacy 블록 유지).
    expect(reduced.skillCooldown).toBe((base.skillCooldown ?? 0) - 1);

    const huge = runUntilSkillFires(99, SEED);
    expect(huge?.skillCooldowns?.novice_focus).toBe(0);
  });

  it("발동하지 않은 스킬의 쿨다운은 건드리지 않는다", () => {
    const s = runUntilSkillFires(1, SEED);
    expect(s).not.toBeNull();
    if (!s) return;
    // novice_focus 하나만 배웠으므로 맵에는 그 키뿐이어야 한다.
    expect(Object.keys(s.skillCooldowns ?? {})).toEqual(["novice_focus"]);
  });
});
