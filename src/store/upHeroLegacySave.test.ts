import { describe, it, expect, vi } from "vitest";

/**
 * Phase 15 통합 — **신규 필드가 없는 기존 저장본 방어.**
 *
 * 이번 변경은 `destroyGuards` / `downGuards` / `combatBuff` 세 필드를 상태와
 * 와이어에 새로 얹었다. 이미 플레이 중인 유저의 저장본과 클라우드 문서에는
 * 그 키가 아예 없다. 없을 때 undefined 가 그대로 흘러 들어가면 강화 판정
 * (`clampGuards`)과 전투 배율(`sessionStats`)이 NaN 을 밟는다.
 *
 * 진행 중이던 탐험도 마찬가지다 — 옛 세션 객체에는 `combatBuff` 가 없다. 앱을
 * 켜자마자 그 세션이 복원돼 계속 돌아야 한다. (굴림틀 pity 스트릭과 오늘 굴림
 * 횟수는 세션이 아니라 `UpHeroState.slotBlankStreak` / `shopDaily.slotSpins` 에
 * 산다 — 그쪽 레거시 방어는 `upHeroSlotPity.test.ts` / `upHeroSlotDailyCap.test.ts`.)
 */
vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { useUpHeroStore } from "./useUpHeroStore";
import { loadFromStorage } from "@/lib/storage";
import { normalizeUpHeroState } from "@/lib/sync";
import { createSession, tickSession } from "@/lib/upHeroCombat";
import { createDefaultHero, enhanceOutcomeRates } from "@/types/uphero";
import { useGameStore } from "./useGameStore";
import type { CombatSession, Equipment, EquipSlot } from "@/types/uphero";

describe("신규 필드 없는 저장본", () => {
  it("클라우드 문서에 세 키가 없어도 기본값으로 채워진다", () => {
    const s = normalizeUpHeroState({ coins: 500 });
    expect(s.destroyGuards).toBe(0);
    expect(s.downGuards).toBe(0);
    // 만료·부재는 0 껍데기로 실린다 (키를 빼면 merge 로 예전 값이 되살아난다).
    expect(s.combatBuff).toEqual({ pct: 0, battlesLeft: 0 });
  });

  it("레거시 protectCharms 는 소실방지권으로 승계된다", () => {
    expect(normalizeUpHeroState({ protectCharms: 3 }).destroyGuards).toBe(3);
    // 신규 키가 함께 있으면 신규 키가 이긴다.
    expect(
      normalizeUpHeroState({ protectCharms: 3, destroyGuards: 7 }).destroyGuards,
    ).toBe(7);
  });

  it("_setFromCloud 가 빠진 필드를 NaN 없이 접는다", () => {
    useUpHeroStore.setState({ destroyGuards: 5, downGuards: 5 });
    useUpHeroStore.getState()._setFromCloud({
      ...useUpHeroStore.getState(),
      destroyGuards: undefined as unknown as number,
      downGuards: undefined as unknown as number,
      combatBuff: undefined,
    });
    const st = useUpHeroStore.getState();
    expect(st.destroyGuards).toBe(0);
    expect(st.downGuards).toBe(0);
    expect(st.combatBuff).toBeUndefined();
    expect(Number.isNaN(st.destroyGuards)).toBe(false);
  });

  it("강화가 방지권 필드 없는 상태에서도 터지지 않는다", () => {
    useUpHeroStore.setState({
      hero: createDefaultHero(),
      inventory: [
        {
          id: "legacy-1",
          baseId: "sword_iron",
          name: "쇠검 +6",
          type: "weapon",
          category: "fitness",
          rarity: "rare",
          iconName: "Sword",
          stats: { str: 5 },
          enhanceLevel: 6,
        },
      ] as never,
      coins: 100000,
      destroyGuards: undefined as unknown as number,
      downGuards: undefined as unknown as number,
      combatBuff: undefined,
      isLoaded: true,
    });
    // 방지권을 걸었지만 보유가 undefined — 0 장으로 읽혀 **막지 못해야** 한다.
    // (undefined 를 "무한"이나 NaN 으로 읽으면 여기서 guarded 가 나온다.)
    const rates = enhanceOutcomeRates("rare", 6);
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.9999999); // 성공 판정 실패
    spy.mockReturnValueOnce(rates.destroy / 2); // 소실 구간
    spy.mockReturnValue(0.999999);
    const r = useUpHeroStore
      .getState()
      .enhanceItem("legacy-1", { destroy: true, down: true });
    expect(r).toMatchObject({ ok: false, reason: "destroyed" });
    spy.mockRestore();
  });

  it("실제 로드 경로(_setFromCloud)를 거치면 항상 숫자가 된다", () => {
    useUpHeroStore.getState()._setFromCloud({
      ...useUpHeroStore.getState(),
      destroyGuards: undefined as unknown as number,
      downGuards: undefined as unknown as number,
    });
    expect(typeof useUpHeroStore.getState().destroyGuards).toBe("number");
    expect(typeof useUpHeroStore.getState().downGuards).toBe("number");
  });
});

describe("진행 중이던 옛 세션", () => {
  it("combatBuff 가 없고 옛 slotSpins 카운터가 남아 있어도 계속 돈다", () => {
    const fresh = createSession("fitness", createDefaultHero("ko"), 1);
    // 옛 저장본 재현 — 신규 세션 필드를 지우고, 예전에 세션에 있던 굴림 카운터는
    //   남겨둔다 (지금은 읽지 않는 필드라 그냥 무시돼야 한다).
    const legacy = { ...fresh, slotSpins: 2 } as Partial<CombatSession> & {
      slotSpins?: number;
    };
    delete legacy.combatBuff;

    let s = legacy as CombatSession;
    // 여러 틱을 돌려도 throw 하지 않고, 버프 없는 상태로 정상 진행한다.
    for (let i = 0; i < 60; i += 1) {
      s = tickSession(s);
      if (s.status === "completed") break;
    }
    expect(s.combatBuff).toBeUndefined();
    expect(["active", "paused", "awaitingChoice", "awaitingMinigame", "completed"])
      .toContain(s.status);
  });

  it("옛 세션을 이어받아도 버프 배율이 NaN 이 되지 않는다", () => {
    const carried = createSession("fitness", createDefaultHero("ko"), 1, undefined, {
      combatBuff: undefined,
    });
    expect(carried.combatBuff).toBeUndefined();
  });
});

/**
 * 좌표가 없던 시절(v5 이하) 저장본과, 구버전 iOS 가 좌표를 벗겨 올린 클라우드
 * 문서의 복구. 유저는 아이템을 트레이로 **옮길 수 없으므로** "배치 0개" 는
 * 정당한 상태가 아니다 — 로드 경로가 배열 순서 first-fit 로 한 번 채워 준다.
 */
describe("격자 가방 좌표가 없는 저장본", () => {
  /** 좌표 세 키가 다 없는가 (= 정리 대기 트레이). */
  const inTray = (item: Equipment) =>
    !Object.prototype.hasOwnProperty.call(item, "bagX") &&
    !Object.prototype.hasOwnProperty.call(item, "bagY") &&
    !Object.prototype.hasOwnProperty.call(item, "bagRot");

  const legacyItem = (id: string, type: EquipSlot): Equipment =>
    ({
      id,
      baseId: `base_${type}`,
      name: id,
      type,
      category: "fitness",
      rarity: "normal",
      iconName: "Sword",
      stats: { str: 1 },
      enhanceLevel: 0,
    }) as Equipment;

  it("v5 저장본은 배열 순서 first-fit 으로 결정적으로 팩된다", () => {
    // 영웅 Lv1 (5행) 보드. 십자 5칸을 피해 좌상 → 우하로 채워진다.
    useGameStore.setState({
      progress: { ...useGameStore.getState().progress, level: 1 },
    });
    vi.mocked(loadFromStorage).mockImplementation((key: string) =>
      key === "uphero"
        ? ({
            schemaVersion: 5,
            heroStartLevel: 1,
            inventory: [
              legacyItem("w", "weapon"),
              legacyItem("a", "armor"),
              legacyItem("c", "accessory"),
              legacyItem("t", "talisman"),
            ],
          } as never)
        : (null as never),
    );
    useUpHeroStore.setState({ isLoaded: false });
    useUpHeroStore.getState().initialize();

    const inv = useUpHeroStore.getState().inventory;
    // 무기 1x2 는 (0,0)-(0,1), 갑옷 2x2 는 십자에 막혀 (0,2) 부터,
    // 1x1 둘은 남은 첫 칸 (1,0) 과 (3,0).
    expect(inv[0]).toMatchObject({ id: "w", bagX: 0, bagY: 0, bagRot: 0 });
    expect(inv[1]).toMatchObject({ id: "a", bagX: 0, bagY: 2, bagRot: 0 });
    expect(inv[2]).toMatchObject({ id: "c", bagX: 1, bagY: 0, bagRot: 0 });
    expect(inv[3]).toMatchObject({ id: "t", bagX: 3, bagY: 0, bagRot: 0 });
    expect(useUpHeroStore.getState().schemaVersion).toBe(6);
    vi.mocked(loadFromStorage).mockImplementation(() => null as never);
  });

  it("좌표가 하나도 없는 클라우드 문서는 _setFromCloud 가 되살린다", () => {
    useUpHeroStore.setState({ heroStartLevel: 1 });
    useUpHeroStore.getState()._setFromCloud({
      ...useUpHeroStore.getState(),
      inventory: [legacyItem("c1", "accessory"), legacyItem("c2", "accessory")],
    });
    const inv = useUpHeroStore.getState().inventory;
    expect(inv.every((i) => !inTray(i))).toBe(true);
    expect(inv[0]).toMatchObject({ bagX: 0, bagY: 0 });
    expect(inv[1]).toMatchObject({ bagX: 1, bagY: 0 });
  });

  it("좌표가 이미 있는 문서는 그대로 둔다 (백필이 배치를 흔들지 않는다)", () => {
    useUpHeroStore.setState({ heroStartLevel: 1 });
    const placed = { ...legacyItem("c1", "accessory"), bagX: 4, bagY: 4, bagRot: 0 };
    const trayItem = legacyItem("c2", "accessory");
    useUpHeroStore.getState()._setFromCloud({
      ...useUpHeroStore.getState(),
      inventory: [placed, trayItem],
    });
    const inv = useUpHeroStore.getState().inventory;
    expect(inv[0]).toMatchObject({ bagX: 4, bagY: 4 });
    // 배치가 하나라도 있으면 전체 팩은 돌지 않는다 — 트레이 아이템은 트레이로 남는다.
    expect(inTray(inv[1])).toBe(true);
  });
});
