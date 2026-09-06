import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 6-E (Track E) — 스키마 v7 마이그레이션 (initialize) + 클라우드 경로 수리.
 *
 * v6 이하 저장본: 옛 iconName("Hanger" 등) / baseId 없음 / 부적 slotBonus 없음 /
 * 도감 키에 접두·affix 가 붙어 있음. initialize 한 번으로 전부 수리되고 schemaVersion 7
 * 로 persist 된다. 두 번째 initialize 는 no-op. `_setFromCloud` 는 게이트 없이 같은
 * 수리를 돌린다 (구 클라이언트가 옛 문서를 올릴 수 있다).
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

import { useUpHeroStore } from "./useUpHeroStore";
import { useGameStore } from "./useGameStore";
import { saveToStorage } from "@/lib/storage";
import { normalizeUpHeroState } from "@/lib/sync";

const legacyRobe = {
  id: "eq_침묵의로브_rare_123_45",
  name: "빛나는 침묵의 로브 of 힘",
  rarity: "rare",
  type: "armor",
  category: "mindfulness",
  iconName: "Hanger",
  stats: { int: 14, str: 2 },
};
const legacyCharm = {
  id: "eq_평정의부적_normal_7_7",
  name: "평정의 부적",
  rarity: "normal",
  type: "talisman",
  category: "mindfulness",
  iconName: "Moon",
  stats: { agi: 5 },
};
const legacyGlasses = {
  id: "eq_지혜의안경_unique_1_1",
  name: "전설적 지혜의 안경 of 힘",
  rarity: "unique",
  type: "accessory",
  category: "learning",
  iconName: "EyeClosed",
  stats: { int: 20, str: 4, crit: 3, slotBonus: 1 },
};

function v6Save() {
  return {
    schemaVersion: 6,
    heroStartLevel: 1,
    heroXp: 500,
    coins: 10,
    inventory: [legacyRobe, legacyCharm],
    hero: { name: "Teo", equipped: { accessory: legacyGlasses } },
    codex: {
      monsters: [],
      bosses: [],
      equipment: ["자기절제의 검 of 민첩, 힘", "빛나는 곡물의 갑옷", "eq_지혜의안경_rare_1_2", "???"],
    },
  };
}

function reinit() {
  useUpHeroStore.getState().resetForSignOut();
  useUpHeroStore.getState().initialize();
  return useUpHeroStore.getState();
}

beforeEach(() => {
  for (const k of Object.keys(stored)) delete stored[k];
  vi.mocked(saveToStorage).mockClear();
  useGameStore.setState({ isLoaded: true, progress: { ...useGameStore.getState().progress, level: 5 } });
  useUpHeroStore.getState().resetForSignOut();
});

describe("v7 — 장비/도감 수리", () => {
  it("v6 저장본이 한 번에 수리되고 schemaVersion 7 로 persist 된다", () => {
    stored.uphero = v6Save();
    const st = reinit();
    const robe = st.inventory.find((i) => i.id === legacyRobe.id)!;
    expect(robe.iconName).toBe("Shirt");
    expect(robe.baseId).toBe("silence_robe");
    expect(robe.dropFloor).toBeGreaterThanOrEqual(9);
    const charm = st.inventory.find((i) => i.id === legacyCharm.id)!;
    expect(charm.iconName).toBe("Moon");
    expect(charm.baseId).toBe("serenity_charm");
    expect(charm.stats.slotBonus).toBe(1);
    expect(st.hero.equipped.accessory?.iconName).toBe("Sunglasses");
    expect(st.hero.equipped.accessory?.baseId).toBe("wisdom_glasses");
    expect(st.codex.equipment).toEqual(["자기절제의 검", "곡물의 갑옷", "지혜의 안경"]);
    expect(st.overflowDrops).toEqual([]);
    const saved = stored.uphero as { schemaVersion?: number; overflowDrops?: unknown[] };
    expect(saved.schemaVersion).toBe(8);
    expect(saved.overflowDrops).toEqual([]);
  });

  it("두 번째 initialize 는 no-op (같은 결과, 추가 persist 없음)", () => {
    stored.uphero = v6Save();
    const first = reinit();
    const snapshot = JSON.stringify({
      inventory: first.inventory,
      equipped: first.hero.equipped,
      codex: first.codex,
    });
    vi.mocked(saveToStorage).mockClear();
    const second = reinit();
    expect(
      JSON.stringify({
        inventory: second.inventory,
        equipped: second.hero.equipped,
        codex: second.codex,
      }),
    ).toBe(snapshot);
    // v7 저장본은 마이그레이션 persist 가 일어나지 않는다 (idle 보상도 없다).
    expect(vi.mocked(saveToStorage)).not.toHaveBeenCalled();
  });

  it("v7 저장본은 수리 단계를 건너뛴다 (있는 그대로)", () => {
    stored.uphero = { ...v6Save(), schemaVersion: 7 };
    const st = reinit();
    // 게이트가 닫혀 있으면 옛 iconName 이 그대로 남는다 — 클라우드 경로가 다시 잡는다.
    expect(st.inventory[0].iconName).toBe("Hanger");
  });

  it("v5 저장본 (A 의 heroXp 시드 + E 수리) 도 한 번에", () => {
    stored.uphero = { ...v6Save(), schemaVersion: 5, heroXp: undefined };
    const st = reinit();
    expect(st.heroXp).toBeDefined();
    expect(st.inventory[0].iconName).toBe("Shirt");
    expect((stored.uphero as { schemaVersion?: number }).schemaVersion).toBe(8);
  });
});

describe("_setFromCloud — 게이트 없는 수리", () => {
  it("구 클라이언트 문서의 옛 iconName/도감 키/부적 slotBonus 를 고친다", () => {
    reinit();
    const payload = normalizeUpHeroState({
      ...v6Save(),
      overflowDrops: [legacyRobe],
    });
    useUpHeroStore.getState()._setFromCloud(payload);
    const st = useUpHeroStore.getState();
    expect(st.inventory[0].iconName).toBe("Shirt");
    expect(st.inventory[1].stats.slotBonus).toBe(1);
    expect(st.hero.equipped.accessory?.iconName).toBe("Sunglasses");
    expect(st.overflowDrops[0].iconName).toBe("Shirt");
    expect(st.overflowDrops[0].baseId).toBe("silence_robe");
    expect(st.codex.equipment).toEqual(["자기절제의 검", "곡물의 갑옷", "지혜의 안경"]);
  });

  it("페이로드에 overflowDrops 가 없어도 (normalize 가 [] 로 채움) 로컬이 깨지지 않는다", () => {
    reinit();
    useUpHeroStore.setState({ overflowDrops: [] });
    useUpHeroStore.getState()._setFromCloud(normalizeUpHeroState({ coins: 5 }));
    expect(useUpHeroStore.getState().overflowDrops).toEqual([]);
  });
});
