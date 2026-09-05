import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 2-A (Track A, 피드백 7/32) — 던전 정산이 **영웅 XP 풀** 로만 간다.
 *
 *  - acknowledgeSessionEnd 는 heroXp 에 rewards.xp 를 더하고, 계정 XP
 *    (useGameStore.progress) 는 한 글자도 건드리지 않는다.
 *  - 사망/포기로 끝난 세션도 XP 는 지급한다 (드롭만 페널티).
 *  - 레벨 마일스톤: pendingHeroLevelUp / novice 스킬 / SP 파생 / 전직 제안 타이밍
 *    (Lv30 을 넘긴 레벨업은 오버레이가 닫힌 뒤에만 전직 제안).
 *  - 미시드(progress 를 어디서도 못 읽음)면 heroXp 를 0 + gain 으로 굳히지 않는다.
 */
const stored: Record<string, unknown> = {};
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn((key: string, value: unknown) => {
    stored[key] = value;
  }),
  loadFromStorage: vi.fn((key: string) => stored[key] ?? null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore } from "./useUpHeroStore";
import { useGameStore } from "./useGameStore";
import { saveToStorage } from "@/lib/storage";
import { createSession } from "@/lib/upHeroCombat";
import {
  createDefaultHero,
  heroTotalXPForLevel,
  heroLevelFromXP,
  type CombatSession,
  type Hero,
} from "@/types/uphero";

function completedSession(xp: number, died = false): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.rewards.xp = xp;
  if (died) {
    s.hero.hp = 0;
    s.log.push({
      type: "sessionEnd",
      reason: "heroDied",
      detail: "test",
      timestamp: Date.now(),
    } as CombatSession["log"][number]);
  }
  s.status = "completed";
  return s;
}

function seedGame(level: number, loaded = true, completions: Record<string, number> = {}) {
  const s = useGameStore.getState();
  useGameStore.setState({
    isLoaded: loaded,
    progress: {
      ...s.progress,
      level,
      xp: 12345,
      categoryCompletions: completions as typeof s.progress.categoryCompletions,
    },
  });
}

function seedHero(heroXp: number | undefined, session: CombatSession, hero: Partial<Hero> = {}) {
  useUpHeroStore.setState({
    hero: { ...createDefaultHero("ko"), ...hero },
    heroXp,
    heroStartLevel: 1,
    pendingHeroLevelUp: null,
    pendingClassChoice: null,
    currentSession: session,
    dungeons: {},
    inventory: [],
    coins: 0,
    ngPlusLevel: 0,
    isLoaded: true,
  });
}

beforeEach(() => {
  for (const k of Object.keys(stored)) delete stored[k];
  vi.mocked(saveToStorage).mockClear();
  seedGame(47);
});

describe("정산 → 영웅 XP 풀", () => {
  it("heroXp 0 + 5000 → 5000, 레벨업 이벤트, 계정 XP 불변", () => {
    seedHero(0, completedSession(5000));
    const before = useGameStore.getState().progress;
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    expect(st.heroXp).toBe(5000);
    expect(st.currentSession).toBeNull();
    const lv = heroLevelFromXP(5000);
    expect(st.pendingHeroLevelUp).toEqual({ from: 1, to: lv });
    // 계정 XP/레벨은 그대로. "progress" 키로 저장한 적도 없다.
    const after = useGameStore.getState().progress;
    expect(after.xp).toBe(before.xp);
    expect(after.level).toBe(before.level);
    const progressWrites = vi
      .mocked(saveToStorage)
      .mock.calls.filter(([key]) => key === "progress");
    expect(progressWrites).toHaveLength(0);
    // 영웅 풀은 persist 됐다.
    expect((stored.uphero as { heroXp?: number }).heroXp).toBe(5000);
  });

  it("사망으로 끝난 세션도 XP 는 지급한다", () => {
    seedHero(1000, completedSession(300, true));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().heroXp).toBe(1300);
  });

  it("레벨이 안 오르면 pendingHeroLevelUp 은 null", () => {
    seedHero(heroTotalXPForLevel(10), completedSession(1));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    expect(st.heroXp).toBe(heroTotalXPForLevel(10) + 1);
    expect(st.pendingHeroLevelUp).toBeNull();
  });

  it("미시드 + progress 를 어디서도 못 읽으면 heroXp 를 쓰지 않는다 (0 시드 금지)", () => {
    seedGame(0, false);
    seedHero(undefined, completedSession(5000));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const st = useUpHeroStore.getState();
    expect(st.heroXp).toBeUndefined();
    expect(st.currentSession).toBeNull();
    expect(st.pendingHeroLevelUp).toBeNull();
  });

  it("미시드 + 게임 스토어 미로드 + localStorage progress Lv47 → 39,031 + gain", () => {
    seedGame(0, false);
    stored.progress = { level: 47 };
    seedHero(undefined, completedSession(5000));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().heroXp).toBe(39031 + 5000);
  });
});

describe("레벨 마일스톤", () => {
  it("novice 스킬은 영웅 Lv5/15 도달 시 자동 지급", () => {
    seedHero(0, completedSession(heroTotalXPForLevel(15)));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    const learned = useUpHeroStore.getState().hero.learnedSkills ?? [];
    expect(learned).toEqual(
      expect.arrayContaining(["novice_heal", "novice_focus", "novice_brace"]),
    );
  });

  it("Lv30 을 넘기면 오버레이 먼저, 전직 제안은 acknowledgeHeroLevelUp 뒤", () => {
    seedGame(47, true, { fitness: 5 });
    seedHero(heroTotalXPForLevel(29), completedSession(2000));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    let st = useUpHeroStore.getState();
    expect(st.pendingHeroLevelUp?.from).toBe(29);
    expect(st.pendingHeroLevelUp?.to).toBeGreaterThanOrEqual(30);
    expect(st.pendingClassChoice).toBeNull();
    st.acknowledgeHeroLevelUp();
    st = useUpHeroStore.getState();
    expect(st.pendingHeroLevelUp).toBeNull();
    expect(st.pendingClassChoice).toEqual({ recommended: "warrior" });
  });

  it("이미 Lv30+ 인데 전직 전이면 (30 을 넘긴 레벨업이 아닐 때) 곧바로 제안", () => {
    seedGame(47, true, { learning: 2 });
    seedHero(heroTotalXPForLevel(33), completedSession(50));
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().pendingClassChoice).toEqual({ recommended: "mage" });
  });

  it("스킬 포인트는 레벨에서 파생 — 31 → 1, 35 → 5, 배운 만큼 차감", () => {
    seedHero(heroTotalXPForLevel(30), completedSession(heroTotalXPForLevel(31) - heroTotalXPForLevel(30)), {
      classType: "warrior",
      learnedSkills: ["warrior_smash_t1"],
    });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(1);

    seedHero(heroTotalXPForLevel(34), completedSession(heroTotalXPForLevel(35) - heroTotalXPForLevel(34)), {
      classType: "warrior",
      learnedSkills: ["warrior_smash_t1", "warrior_berserk_t2"],
      skillPoints: 99, // 옛 카운터 값은 무시되고 다시 파생된다.
    });
    useUpHeroStore.getState().acknowledgeSessionEnd();
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(5 - 1);
  });
});
