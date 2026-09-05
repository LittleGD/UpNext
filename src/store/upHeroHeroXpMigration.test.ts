import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 2-A (Track A) — 영웅 XP 풀 시드 / 마이그레이션 / 클라우드 병합 안전장치.
 *
 * 핵심 계약: **0 으로 시드하는 경로는 없다.** 레거시 저장본(v5 이하)은
 * `heroTotalXPForLevel(레거시 영웅 Lv)` 로 정확히 같은 레벨에서 시드된다
 * (Lv47 → 39,031). progress 를 못 읽으면 미시드로 두고 나중에 채운다.
 *
 * 클라우드: heroXp 는 단조 증가 축이라 `mergeCloudHeroXp` 가 max 병합하고,
 * `_setFromCloud` 는 페이로드에 키가 없으면 heroXp 를 undefined 로 되돌려
 * (온보딩 레이스에서 Lv1 기준 0 이 먼저 시드됐어도) 클라우드 progress 로 다시
 * 시드한다 — 시드는 microtask 뒤에 돌아 업로드 게이트를 지난다.
 */
const stored: Record<string, unknown> = {};
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn((key: string, value: unknown) => {
    stored[key] = value;
  }),
  loadFromStorage: vi.fn((key: string) => stored[key] ?? null),
  removeFromStorage: vi.fn((key: string) => {
    delete stored[key];
  }),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore, pickPersisted } from "./useUpHeroStore";
import { useGameStore } from "./useGameStore";
import { saveToStorage } from "@/lib/storage";
import { normalizeUpHeroState, hasUpHeroFootprint } from "@/lib/sync";
import { HERO_XP_CAP, resolveHeroLevel } from "@/types/uphero";

function seedGame(level: number, loaded = true) {
  const s = useGameStore.getState();
  useGameStore.setState({
    isLoaded: loaded,
    progress: { ...s.progress, level, xp: 777 },
  });
}

function reinit() {
  useUpHeroStore.getState().resetForSignOut();
  useUpHeroStore.getState().initialize();
  return useUpHeroStore.getState();
}

function heroLevel() {
  const st = useUpHeroStore.getState();
  return resolveHeroLevel(st.heroXp, useGameStore.getState().progress.level, st.heroStartLevel);
}

beforeEach(() => {
  for (const k of Object.keys(stored)) delete stored[k];
  vi.mocked(saveToStorage).mockClear();
  useUpHeroStore.getState().resetForSignOut();
});

describe("v6 시드 — 레거시 저장본", () => {
  it("heroStartLevel 1 + 계정 Lv47 → heroXp 39,031, 영웅 Lv47, 스키마 6 persist", () => {
    seedGame(47);
    stored.uphero = { schemaVersion: 5, heroStartLevel: 1, coins: 10 };
    const st = reinit();
    expect(st.heroXp).toBe(39031);
    expect(heroLevel()).toBe(47);
    const saved = stored.uphero as { heroXp?: number; schemaVersion?: number };
    expect(saved.heroXp).toBe(39031);
    expect(saved.schemaVersion).toBe(6);
  });

  it("heroStartLevel 41 + 계정 Lv43 → 영웅 Lv3 → 245", () => {
    seedGame(43);
    stored.uphero = { schemaVersion: 5, heroStartLevel: 41, coins: 10 };
    const st = reinit();
    expect(st.heroXp).toBe(245);
    expect(heroLevel()).toBe(3);
  });

  it("완전 신규 (저장본 없음) → heroXp 0, Lv1", () => {
    seedGame(12);
    const st = reinit();
    expect(st.heroXp).toBe(0);
    expect(heroLevel()).toBe(1);
  });

  it("이미 v6 저장본은 값을 그대로 (clamp 만)", () => {
    seedGame(47);
    stored.uphero = { schemaVersion: 6, heroStartLevel: 1, heroXp: 50000, coins: 10 };
    expect(reinit().heroXp).toBe(50000);
    stored.uphero = { schemaVersion: 6, heroStartLevel: 1, heroXp: 1e15, coins: 10 };
    expect(reinit().heroXp).toBe(HERO_XP_CAP);
    stored.uphero = { schemaVersion: 6, heroStartLevel: 1, heroXp: -9, coins: 10 };
    expect(reinit().heroXp).toBe(0);
  });
});

describe("시드 소스 폴백", () => {
  it("게임 스토어 미로드 + localStorage progress Lv47 → 39,031", () => {
    seedGame(0, false);
    stored.progress = { level: 47 };
    stored.uphero = { schemaVersion: 5, heroStartLevel: 1, coins: 10 };
    expect(reinit().heroXp).toBe(39031);
  });

  it("미로드 + progress 없음 → 미시드 유지, 표시 레벨은 레거시 공식, 로드 뒤 ensureHeroXp 가 채운다", () => {
    seedGame(0, false);
    stored.uphero = { schemaVersion: 5, heroStartLevel: 1, coins: 10 };
    const st = reinit();
    expect(st.heroXp).toBeUndefined();
    expect(resolveHeroLevel(st.heroXp, 47, st.heroStartLevel)).toBe(47);
    // 이제 progress 가 로드됐다 (UpHeroGame 효과가 ensureHeroXp 를 부른다).
    seedGame(47);
    useUpHeroStore.getState().ensureHeroXp();
    expect(useUpHeroStore.getState().heroXp).toBe(39031);
    expect((stored.uphero as { heroXp?: number }).heroXp).toBe(39031);
    // 멱등.
    useUpHeroStore.getState().ensureHeroXp();
    expect(useUpHeroStore.getState().heroXp).toBe(39031);
  });

  it("미로드 + progress 없음이면 이번 hydrate 의 방치 보상도 미룬다 (lastIdleAccrualAt 보존)", () => {
    seedGame(0, false);
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    stored.uphero = {
      schemaVersion: 5,
      heroStartLevel: 1,
      coins: 10,
      lastIdleAccrualAt: twoHoursAgo,
      lastSeenAt: twoHoursAgo,
    };
    const st = reinit();
    expect(st.heroXp).toBeUndefined();
    expect(st.idleReward).toBeNull();
    expect(st.lastIdleAccrualAt).toBe(twoHoursAgo);
  });
});

describe("방치 보상", () => {
  it("방치 XP 는 heroXp 로, 계정 XP 는 불변", () => {
    seedGame(47);
    const before = useGameStore.getState().progress;
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    stored.uphero = {
      schemaVersion: 6,
      heroStartLevel: 1,
      heroXp: 39031,
      coins: 10,
      lastIdleAccrualAt: twoHoursAgo,
      lastSeenAt: twoHoursAgo,
    };
    const st = reinit();
    expect(st.idleReward).not.toBeNull();
    expect(st.heroXp).toBe(39031 + (st.idleReward?.xp ?? 0));
    expect(st.idleReward?.xp ?? 0).toBeGreaterThan(0);
    const after = useGameStore.getState().progress;
    expect(after.xp).toBe(before.xp);
    expect(after.level).toBe(before.level);
    expect(vi.mocked(saveToStorage).mock.calls.some(([k]) => k === "progress")).toBe(false);
  });
});

describe("클라우드 — _setFromCloud", () => {
  it("로컬 0 (Lv1 시드) + 구 클라이언트 문서(heroXp 없음) + 클라우드 progress Lv47 → 39,031 업로드", async () => {
    // 온보딩 레이스: 로컬이 progress 기본값으로 먼저 0 을 시드했다.
    seedGame(1);
    const st = reinit();
    expect(st.heroXp).toBe(0);
    // 클라우드 progress(Lv47)가 먼저 적용되고, 구 클라이언트 uphero 문서가 채택된다.
    seedGame(47);
    vi.mocked(saveToStorage).mockClear();
    useUpHeroStore.getState()._setFromCloud(normalizeUpHeroState({ coins: 5, inventory: [] }));
    // 동기적으로는 미시드로 되돌린다 (spread 로 로컬 0 이 남지 않게).
    expect(useUpHeroStore.getState().heroXp).toBeUndefined();
    await Promise.resolve();
    expect(useUpHeroStore.getState().heroXp).toBe(39031);
    // 시드값이 persist(=업로드 경로) 됐다 — microtask 라 isUpdatingFromCloud 게이트 뒤.
    const upload = vi
      .mocked(saveToStorage)
      .mock.calls.find(([k, v]) => k === "uphero" && (v as { heroXp?: number }).heroXp === 39031);
    expect(upload).toBeDefined();
  });

  it("페이로드에 heroXp 가 있으면 채택하고 clamp 한다", async () => {
    seedGame(47);
    reinit();
    useUpHeroStore.getState()._setFromCloud(normalizeUpHeroState({ heroXp: 500 }));
    await Promise.resolve();
    expect(useUpHeroStore.getState().heroXp).toBe(500);
    useUpHeroStore.getState()._setFromCloud(normalizeUpHeroState({ heroXp: 1e15 }));
    await Promise.resolve();
    expect(useUpHeroStore.getState().heroXp).toBe(HERO_XP_CAP);
  });

  it("채택 뒤 SP 캐시도 다시 파생된다", async () => {
    seedGame(47);
    reinit();
    useUpHeroStore.getState()._setFromCloud(
      normalizeUpHeroState({
        heroXp: 17765, // Lv35
        hero: { classType: "warrior", learnedSkills: ["warrior_smash_t1", "warrior_berserk_t2"], skillPoints: 99 },
      }),
    );
    await Promise.resolve();
    expect(useUpHeroStore.getState().hero.skillPoints).toBe(4);
  });
});

describe("클라우드 — mergeCloudHeroXp (단조 병합)", () => {
  beforeEach(() => {
    seedGame(47);
    reinit();
  });

  it("클라우드가 더 크면 채택", () => {
    useUpHeroStore.setState({ heroXp: 100 });
    useUpHeroStore.getState().mergeCloudHeroXp(200);
    expect(useUpHeroStore.getState().heroXp).toBe(200);
    expect((stored.uphero as { heroXp?: number }).heroXp).toBe(200);
  });

  it("클라우드가 작으면 무시", () => {
    useUpHeroStore.setState({ heroXp: 300 });
    useUpHeroStore.getState().mergeCloudHeroXp(200);
    expect(useUpHeroStore.getState().heroXp).toBe(300);
  });

  it("클라우드에 없으면 no-op, 로컬 미시드면 클라우드 값 채택", () => {
    useUpHeroStore.setState({ heroXp: 300 });
    useUpHeroStore.getState().mergeCloudHeroXp(undefined);
    expect(useUpHeroStore.getState().heroXp).toBe(300);
    useUpHeroStore.setState({ heroXp: undefined });
    useUpHeroStore.getState().mergeCloudHeroXp(200);
    expect(useUpHeroStore.getState().heroXp).toBe(200);
    // 레거시 공식(39,031)보다 알려진 클라우드 값이 우선 — ensureHeroXp 가 덮지 않는다.
    useUpHeroStore.getState().ensureHeroXp();
    expect(useUpHeroStore.getState().heroXp).toBe(200);
  });

  it("병합은 오버레이를 띄우지 않는다 (다른 기기가 이미 본 레벨업)", () => {
    useUpHeroStore.setState({ heroXp: 0, pendingHeroLevelUp: null });
    useUpHeroStore.getState().mergeCloudHeroXp(39031);
    expect(useUpHeroStore.getState().pendingHeroLevelUp).toBeNull();
  });
});

describe("클라우드 — mergeCloudHeroXp (hydrate 전, 저장본 레코드에만 병합)", () => {
  // 아지트를 안 거친 라우트(/settings 로그인, /collection, /minigame)에서 리스너
  //   스냅샷이 initialize 보다 먼저 온다. 이때 in-memory 는 기본값이므로 그걸
  //   persist 하면 로컬 흔적이 지워지고 adoptCloudUpHero 의 "로컬 흔적 우선" 게이트가
  //   뚫린다 (익명 플레이 뒤 설정에서 로그인 → 코인·인벤 소실).
  const localSave = () => ({
    schemaVersion: 6,
    heroStartLevel: 1,
    coins: 500,
    inventory: [{ id: "it-1", baseId: "sword_iron", type: "weapon", rarity: "rare" }],
    hero: { name: "Teo" },
    heroXp: 40000,
  });

  it("클라우드가 더 크면 저장본의 코인·인벤·영웅은 유지하고 heroXp 만 올린다, 스토어는 그대로", () => {
    stored.uphero = localSave();
    expect(useUpHeroStore.getState().isLoaded).toBe(false);
    useUpHeroStore.getState().mergeCloudHeroXp(45000);
    const saved = stored.uphero as ReturnType<typeof localSave>;
    expect(saved.coins).toBe(500);
    expect(saved.inventory).toHaveLength(1);
    expect(saved.hero.name).toBe("Teo");
    expect(saved.heroXp).toBe(45000);
    expect(hasUpHeroFootprint(saved)).toBe(true);
    // in-memory 는 손대지 않는다 — hydrate 는 initialize 몫.
    const st = useUpHeroStore.getState();
    expect(st.isLoaded).toBe(false);
    expect(st.heroXp).toBeUndefined();
    expect(st.coins).toBe(0);
    // 이어서 initialize 가 저장본에서 병합값을 읽는다.
    seedGame(47);
    useUpHeroStore.getState().initialize();
    expect(useUpHeroStore.getState().heroXp).toBe(45000);
    expect(useUpHeroStore.getState().coins).toBe(500);
  });

  it("클라우드가 저장본 이하면 저장소를 건드리지 않는다", () => {
    stored.uphero = localSave();
    vi.mocked(saveToStorage).mockClear();
    useUpHeroStore.getState().mergeCloudHeroXp(40000);
    useUpHeroStore.getState().mergeCloudHeroXp(12345);
    expect(vi.mocked(saveToStorage)).not.toHaveBeenCalled();
    expect((stored.uphero as { heroXp?: number }).heroXp).toBe(40000);
    expect(useUpHeroStore.getState().isLoaded).toBe(false);
  });

  it("저장본이 없으면 heroXp 단독 레코드만 남긴다 — 흔적이 아니라 게이트는 그대로", () => {
    useUpHeroStore.getState().mergeCloudHeroXp(45000);
    expect(stored.uphero).toEqual({ heroXp: 45000 });
    expect(hasUpHeroFootprint(stored.uphero)).toBe(false);
    expect(useUpHeroStore.getState().isLoaded).toBe(false);
    // 레거시 공식(39,031)보다 알려진 클라우드 값이 우선.
    seedGame(47);
    useUpHeroStore.getState().initialize();
    expect(useUpHeroStore.getState().heroXp).toBe(45000);
  });
});

describe("영속 / 로그아웃", () => {
  it("pickPersisted 에 heroXp 가 실리고 pendingHeroLevelUp 은 실리지 않는다", () => {
    seedGame(47);
    reinit();
    useUpHeroStore.setState({ heroXp: 4321, pendingHeroLevelUp: { from: 1, to: 2 } });
    const p = pickPersisted(useUpHeroStore.getState());
    expect(p.heroXp).toBe(4321);
    expect("pendingHeroLevelUp" in p).toBe(false);
  });

  it("resetForSignOut 은 heroXp 를 undefined 로, pendingHeroLevelUp 을 null 로", () => {
    seedGame(47);
    reinit();
    useUpHeroStore.setState({ heroXp: 4321, pendingHeroLevelUp: { from: 1, to: 2 } });
    useUpHeroStore.getState().resetForSignOut();
    const st = useUpHeroStore.getState();
    expect(st.heroXp).toBeUndefined();
    expect(st.pendingHeroLevelUp).toBeNull();
  });
});
