import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 2-A (Track A, 피드백 7/34a) — 스킬 포인트는 **레벨에서 파생** 된다.
 *
 *   남은 SP = max(0, skillPointsTotalForLevel(영웅 Lv) - Σ pointCost(learnedSkills))
 *
 * 별도 지급/소모 카운터가 없다: grantSkillPoints 는 제거됐고 pointCost 가 유일한
 * 소비 경로다. hero.skillPoints 는 구 클라이언트 호환용 파생 캐시일 뿐이며
 * reconcileSkillPoints 가 다시 계산해 넣는다 (멱등).
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import {
  useUpHeroStore,
  deriveSkillPoints,
  spentSkillPoints,
} from "./useUpHeroStore";
import { useGameStore } from "./useGameStore";
import { saveToStorage } from "@/lib/storage";
import { createDefaultHero, heroTotalXPForLevel, type Hero } from "@/types/uphero";

const T1 = "warrior_smash_t1"; // pointCost 0, Lv30
const T2 = "warrior_berserk_t2"; // pointCost 1, Lv35
const T3 = "warrior_crush_t3"; // pointCost 1, Lv40
const T4 = "warrior_rage_burst_t4"; // pointCost 2, Lv45
/** 다른 클래스 T2 — pointCost 1 씩. "포인트 부족" 케이스를 만들기 위한 소모분. */
const OTHER_T2 = ["mage_freeze_t2", "monk_flash_t2", "druid_root_t2", "bard_ensemble_t2", "priest_purge_t2"];

function seed(level: number, learnedSkills: string[], hero: Partial<Hero> = {}) {
  useGameStore.setState({ isLoaded: true });
  useUpHeroStore.setState({
    hero: { ...createDefaultHero("ko"), classType: "warrior", learnedSkills, ...hero },
    heroXp: heroTotalXPForLevel(level),
    heroStartLevel: 1,
    isLoaded: true,
  });
}

beforeEach(() => {
  vi.mocked(saveToStorage).mockClear();
});

describe("파생 헬퍼", () => {
  it("spentSkillPoints — findSkillById 로 풀리는 id 의 pointCost 합, 모르는 id 는 0", () => {
    expect(spentSkillPoints({ learnedSkills: [T1, T2] })).toBe(1);
    expect(spentSkillPoints({ learnedSkills: [T1, T2, T3, T4] })).toBe(4);
    expect(spentSkillPoints({ learnedSkills: ["ghost_skill", "novice_heal"] })).toBe(0);
    expect(spentSkillPoints({ learnedSkills: undefined })).toBe(0);
  });

  it("deriveSkillPoints — Lv35 에 [T1,T2] → 4, Lv30 이하 → 0, 음수 없음", () => {
    expect(deriveSkillPoints({ learnedSkills: [T1, T2] }, 35)).toBe(4);
    expect(deriveSkillPoints({ learnedSkills: [T1] }, 30)).toBe(0);
    expect(deriveSkillPoints({ learnedSkills: [T1, T2, T3, T4] }, 31)).toBe(0);
    expect(deriveSkillPoints({ learnedSkills: [] }, 45)).toBe(15);
  });
});

describe("learnSkill", () => {
  it("ok — learnedSkills 에 추가되고 SP 캐시가 다시 파생된다", () => {
    seed(35, [T1]);
    expect(useUpHeroStore.getState().learnSkill(T2)).toBe("ok");
    const h = useUpHeroStore.getState().hero;
    expect(h.learnedSkills).toContain(T2);
    expect(h.skillPoints).toBe(4);
  });

  it("level — 영웅 레벨이 모자라면 (heroXp 풀 기준) 거절", () => {
    seed(35, [T1]);
    expect(useUpHeroStore.getState().learnSkill(T3)).toBe("level");
  });

  it("no-points — 파생 SP 가 0 이면 거절", () => {
    // Lv35 = 5 SP, 다른 클래스 T2 다섯 개로 5 소모 → 남은 0.
    seed(35, [T1, ...OTHER_T2]);
    expect(deriveSkillPoints(useUpHeroStore.getState().hero, 35)).toBe(0);
    expect(useUpHeroStore.getState().learnSkill(T2)).toBe("no-points");
  });

  it("already / class / not-found", () => {
    seed(45, [T1, T2]);
    const s = useUpHeroStore.getState();
    expect(s.learnSkill(T2)).toBe("already");
    expect(s.learnSkill("mage_freeze_t2")).toBe("class");
    expect(s.learnSkill("nope")).toBe("not-found");
  });

  it("T4 는 2 포인트 — 45 에서 [T1,T2,T3] 뒤 배우면 15-4 = 11", () => {
    seed(45, [T1, T2, T3]);
    expect(useUpHeroStore.getState().learnSkill(T4)).toBe("ok");
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(11);
  });
});

describe("reconcileSkillPoints", () => {
  it("옛 카운터 값을 버리고 파생값으로 덮는다, 두 번째 호출은 no-op (멱등)", () => {
    seed(35, [T1, T2], { skillPoints: 99 });
    useUpHeroStore.getState().reconcileSkillPoints();
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(4);
    const writes = vi.mocked(saveToStorage).mock.calls.length;
    useUpHeroStore.getState().reconcileSkillPoints();
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(4);
    expect(vi.mocked(saveToStorage).mock.calls.length).toBe(writes);
  });

  it("전직 전(Lv30 이하)엔 항상 0 — 계정 레벨로 받은 옛 SP 는 소멸 (의도)", () => {
    seed(7, [], { classType: null, skillPoints: 5 });
    useUpHeroStore.getState().reconcileSkillPoints();
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(0);
  });

  it("grantSkillPoints 는 더 이상 스토어에 없다", () => {
    // @ts-expect-error — Phase 2-A 에서 제거됐다. 되살리면 여기서 컴파일이 깨진다.
    expect(useUpHeroStore.getState().grantSkillPoints).toBeUndefined();
  });
});
