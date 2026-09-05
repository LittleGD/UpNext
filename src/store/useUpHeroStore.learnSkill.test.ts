import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 3-F (피드백 34b) — learnSkill 의 분기 규칙 + respecSkills.
 *
 *   시드: heroXp = heroTotalXPForLevel(45) = 34,650 (Lv45 → SP 총 15), warrior, [T1].
 *   SP 는 pointCost 합에서 파생되므로 리스펙엔 환급 산술이 없다: learnedSkills 를
 *   [T1] 로 되돌리면 파생값이 15 로 돌아온다.
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore } from "./useUpHeroStore";
import { useGameStore } from "./useGameStore";
import { saveToStorage } from "@/lib/storage";
import {
  createDefaultHero,
  heroTotalXPForLevel,
  SHOP_PRICES,
  type CombatSession,
} from "@/types/uphero";

const T1 = "warrior_smash_t1";
const T2A = "warrior_berserk_t2";
const T2B = "warrior_ironwall_t2";
const T3B = "warrior_warcry_t3";
const T4 = "warrior_rage_burst_t4";

function seed(o: { coins?: number; learned?: string[]; session?: CombatSession | null } = {}) {
  useGameStore.setState({ isLoaded: true });
  useUpHeroStore.setState({
    hero: {
      ...createDefaultHero("ko"),
      classType: "warrior",
      learnedSkills: o.learned ?? [T1],
    },
    heroXp: heroTotalXPForLevel(45),
    heroStartLevel: 1,
    coins: o.coins ?? 300,
    currentSession: o.session ?? null,
    isLoaded: true,
  });
  useUpHeroStore.getState().reconcileSkillPoints();
}

const sp = () => useUpHeroStore.getState().hero.skillPoints;
const learned = () => useUpHeroStore.getState().hero.learnedSkills;

beforeEach(() => {
  vi.mocked(saveToStorage).mockClear();
});

describe("learnSkill — 분기 규칙 (Lv45, SP 15)", () => {
  it("시드 확인: heroTotalXPForLevel(45) = 34,650, SP 15", () => {
    seed();
    expect(heroTotalXPForLevel(45)).toBe(34_650);
    expect(sp()).toBe(15);
  });

  it("T2a ok → 14, T2b branch, T4 requires, T3b ok → 13, T4 ok → 11, already, 타 class", () => {
    seed();
    const st = useUpHeroStore.getState();
    expect(st.learnSkill(T2A)).toBe("ok");
    expect(sp()).toBe(14);
    expect(st.learnSkill(T2B)).toBe("branch");
    expect(sp()).toBe(14);
    expect(st.learnSkill(T4)).toBe("requires");
    expect(st.learnSkill(T3B)).toBe("ok");
    expect(sp()).toBe(13);
    expect(st.learnSkill(T4)).toBe("ok");
    expect(sp()).toBe(11);
    expect(st.learnSkill(T4)).toBe("already");
    expect(st.learnSkill("mage_freeze_t2")).toBe("class");
    expect(st.learnSkill("ghost")).toBe("not-found");
    expect(learned()).toEqual([T1, T2A, T3B, T4]);
  });

  it("전직 전이면 class", () => {
    seed();
    useUpHeroStore.setState({
      hero: { ...useUpHeroStore.getState().hero, classType: null },
    });
    expect(useUpHeroStore.getState().learnSkill(T2A)).toBe("class");
  });
});

describe("respecSkills", () => {
  it("코인 299 → no-coins, 상태 불변", () => {
    seed({ coins: 299 });
    const st = useUpHeroStore.getState();
    expect(st.learnSkill(T2A)).toBe("ok");
    expect(st.learnSkill(T3B)).toBe("ok");
    expect(st.learnSkill(T4)).toBe("ok");
    expect(sp()).toBe(11);
    vi.mocked(saveToStorage).mockClear();
    expect(useUpHeroStore.getState().respecSkills()).toBe("no-coins");
    expect(learned()).toEqual([T1, T2A, T3B, T4]);
    expect(sp()).toBe(11);
    expect(useUpHeroStore.getState().coins).toBe(299);
    expect(saveToStorage).not.toHaveBeenCalled();
  });

  it("코인 300 → ok: learned [T1], SP 15 복구, 코인 0; 다시 → nothing", () => {
    seed({ coins: 300 });
    const st = useUpHeroStore.getState();
    st.learnSkill(T2A);
    st.learnSkill(T3B);
    st.learnSkill(T4);
    expect(sp()).toBe(11);
    expect(SHOP_PRICES.skillRespec).toBe(300);
    expect(useUpHeroStore.getState().respecSkills()).toBe("ok");
    expect(learned()).toEqual([T1]);
    expect(sp()).toBe(15);
    expect(useUpHeroStore.getState().coins).toBe(0);
    expect(saveToStorage).toHaveBeenCalled();
    // 환급 산술이 아니라 파생: reconcile 을 다시 돌려도 15 그대로.
    useUpHeroStore.getState().reconcileSkillPoints();
    expect(sp()).toBe(15);
    expect(useUpHeroStore.getState().respecSkills()).toBe("nothing");
    expect(useUpHeroStore.getState().coins).toBe(0);
  });

  it("리스펙 뒤 다른 분기로 다시 배울 수 있다 (b 경로)", () => {
    seed({ coins: 300 });
    const st = useUpHeroStore.getState();
    st.learnSkill(T2A);
    expect(st.learnSkill(T2B)).toBe("branch");
    expect(st.respecSkills()).toBe("ok");
    expect(useUpHeroStore.getState().learnSkill(T2B)).toBe("ok");
    expect(learned()).toEqual([T1, T2B]);
    expect(sp()).toBe(14);
  });

  it("전직 전 → class", () => {
    seed();
    useUpHeroStore.setState({
      hero: { ...useUpHeroStore.getState().hero, classType: null },
    });
    expect(useUpHeroStore.getState().respecSkills()).toBe("class");
  });

  it("진행 중 세션: hero 스냅샷 미러 + 제거된 스킬 쿨다운 삭제", () => {
    const session = {
      dungeonId: "fitness",
      startFloor: 1,
      currentFloor: 3,
      log: [],
      hero: {
        ...createDefaultHero("ko"),
        classType: "warrior",
        learnedSkills: [T1, T2A, T3B],
      },
      rewards: { xp: 0, coins: 0, drops: [] },
      status: "active",
      speed: 1,
      time: 200,
      maxTime: 220,
      classResource: 50,
      skillCooldowns: { [T1]: 2, [T2A]: 4, [T3B]: 6 },
      startedAt: 0,
    } as unknown as CombatSession;
    seed({ coins: 300, learned: [T1, T2A, T3B], session });
    expect(useUpHeroStore.getState().respecSkills()).toBe("ok");
    const next = useUpHeroStore.getState().currentSession!;
    expect(next.hero.learnedSkills).toEqual([T1]);
    expect(next.skillCooldowns).toEqual({ [T1]: 2 });
    expect(next.currentFloor).toBe(3);
  });
});
