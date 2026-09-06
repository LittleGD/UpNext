import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * 업로드 게이트 테스트용 Firestore 대역 — 아래 "채택 뒤 업로드" describe 만 쓴다.
 * 순수 함수 테스트는 영향 없음 (sync.ts 는 firebase 를 지연 import 한다).
 */
const fs = vi.hoisted(() => ({
  snapshotCb: null as null | ((snap: unknown) => void),
  setDoc: vi.fn(async () => {}),
}));
vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: true,
  getFirebase: vi.fn(async () => ({ db: {} })),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref: unknown, cb: (snap: unknown) => void) => {
    fs.snapshotCb = cb;
    return () => {};
  }),
  setDoc: fs.setDoc,
  serverTimestamp: vi.fn(() => "ts"),
}));

import {
  normalizeUpHeroState,
  hasUpHeroFootprint,
  encodeUpHeroForCloud,
  startListener,
  stopListener,
  setSyncReady,
  flushPendingSync,
} from "./sync";
import { saveToStorage } from "@/lib/storage";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { ENHANCE_GUARD_MAX, HERO_XP_CAP } from "@/types/uphero";

/**
 * Phase 15 — 방지권 2종 + 슬롯 전투 버프의 클라우드 왕복 회귀 테스트.
 *
 * 와이어 키는 `destroyGuards` / `downGuards` / `combatBuff` 이며 iOS
 * `UpHeroCloudSchema` 의 CodingKeys 와 철자가 같아야 한다. iOS 는 화이트리스트
 * 디코드라 이름이 어긋나면 에러 없이 필드가 사라진다 — 그래서 "잘못된 값이 잘
 * 교정되는가" 만큼 "키가 그대로인가" 도 테스트로 붙잡아 둔다.
 */
describe("normalizeUpHeroState — 방지권 2종", () => {
  it("정상 값은 그대로 왕복한다", () => {
    const out = normalizeUpHeroState({ destroyGuards: 7, downGuards: 3 });
    expect(out.destroyGuards).toBe(7);
    expect(out.downGuards).toBe(3);
  });

  it("필드가 없는 기존 저장본은 0 으로 읽힌다", () => {
    expect(normalizeUpHeroState({}).destroyGuards).toBe(0);
    expect(normalizeUpHeroState({}).downGuards).toBe(0);
  });

  it("0 이어도 키를 남긴다 — merge 로 예전 개수가 되살아나면 안 된다", () => {
    // setDoc(merge: true) 는 키가 빠지면 클라우드의 옛 값을 그대로 둔다.
    // coins 와 같은 이유로 방지권 개수는 항상 페이로드에 실려야 한다.
    const keys = Object.keys(normalizeUpHeroState({}));
    expect(keys).toContain("destroyGuards");
    expect(keys).toContain("downGuards");
    expect(keys).toContain("combatBuff");
  });

  it("음수·소수·상한 초과·타입 불일치를 관용적으로 교정한다", () => {
    expect(normalizeUpHeroState({ destroyGuards: -3 }).destroyGuards).toBe(0);
    expect(normalizeUpHeroState({ downGuards: 2.7 }).downGuards).toBe(2);
    expect(normalizeUpHeroState({ destroyGuards: 1e9 }).destroyGuards).toBe(
      ENHANCE_GUARD_MAX,
    );
    expect(normalizeUpHeroState({ downGuards: "많이" }).downGuards).toBe(0);
    expect(normalizeUpHeroState({ destroyGuards: NaN }).destroyGuards).toBe(0);
  });

  it("레거시 protectCharms 저장본은 소실방지권으로 읽어준다", () => {
    // 단일 보호 소모품 시절의 키. 그 시절 저장본이 남아 있어도 보유가 증발하면 안 된다.
    expect(normalizeUpHeroState({ protectCharms: 4 }).destroyGuards).toBe(4);
    // 새 키가 있으면 새 키가 이긴다 (레거시가 최신 값을 덮지 않게).
    expect(
      normalizeUpHeroState({ protectCharms: 4, destroyGuards: 1 }).destroyGuards,
    ).toBe(1);
  });

  it("보유 자체가 플레이 흔적으로 인정된다", () => {
    expect(hasUpHeroFootprint({ destroyGuards: 1 })).toBe(true);
    expect(hasUpHeroFootprint({ downGuards: 1 })).toBe(true);
    expect(hasUpHeroFootprint({ destroyGuards: 0, downGuards: 0 })).toBe(false);
  });
});

/**
 * Phase 5-B — enhanceLevel 0..20 은 와이어 키 변경 없이 그대로 왕복한다.
 * normalizeEquipment 는 필드를 spread 하므로 20 도, 사진 부적의 talismanSkills 도 남는다.
 */
describe("normalizeUpHeroState — enhanceLevel 20 왕복", () => {
  it("inventory 아이템의 enhanceLevel 20 과 talismanSkills 가 그대로 남는다", () => {
    const out = normalizeUpHeroState({
      inventory: [
        {
          id: "it-20",
          baseId: "sword_iron",
          name: "쇠검 +20",
          type: "weapon",
          rarity: "rare",
          category: "fitness",
          iconName: "Sword",
          stats: { str: 25, dex: 8 },
          enhanceLevel: 20,
          enhanceFailStreak: 0,
        },
        {
          id: "ph-10",
          name: "추억의 부적 +10",
          type: "talisman",
          rarity: "rare",
          category: "fitness",
          iconName: "Photo",
          photoId: "photo-1",
          stats: { vit: 5 },
          enhanceLevel: 10,
          talismanSkills: ["fit5", "fit10"],
        },
      ],
    });
    const inv = out.inventory ?? [];
    expect(inv).toHaveLength(2);
    expect(inv[0].enhanceLevel).toBe(20);
    expect(inv[0].stats).toEqual({ str: 25, dex: 8 });
    expect(inv[1].enhanceLevel).toBe(10);
    expect(inv[1].talismanSkills).toEqual(["fit5", "fit10"]);
    // 인코딩 후에도 그대로 (와이어 키 변경 없음).
    const encoded = encodeUpHeroForCloud(out) as { inventory: Array<{ enhanceLevel?: number }> };
    expect(encoded.inventory[0].enhanceLevel).toBe(20);
  });
});

describe("normalizeUpHeroState — combatBuff", () => {
  // pct 는 퍼센트 포인트다 (10 = +10%). 굴림틀이 실제로 거는 값이 10 이라
  // 여기서 10 이 그대로 왕복하는지가 핵심이다 — 예전 상한 1 은 이걸 1 로 접어
  // 다음 탐험의 버프를 +10% 에서 +1% 로 떨어뜨렸다.
  it("살아있는 버프는 그대로 왕복한다", () => {
    expect(
      normalizeUpHeroState({ combatBuff: { pct: 10, battlesLeft: 3 } }).combatBuff,
    ).toEqual({ pct: 10, battlesLeft: 3 });
  });

  it("만료·손상된 버프는 0 껍데기로 실린다 (키를 빼면 merge 로 부활한다)", () => {
    expect(normalizeUpHeroState({}).combatBuff).toEqual({ pct: 0, battlesLeft: 0 });
    expect(
      normalizeUpHeroState({ combatBuff: { pct: 10, battlesLeft: 0 } }).combatBuff,
    ).toEqual({ pct: 0, battlesLeft: 0 });
    expect(
      normalizeUpHeroState({ combatBuff: { pct: -1, battlesLeft: 3 } }).combatBuff,
    ).toEqual({ pct: 0, battlesLeft: 0 });
    expect(normalizeUpHeroState({ combatBuff: "buff" }).combatBuff).toEqual({
      pct: 0,
      battlesLeft: 0,
    });
  });

  it("손상된 과대 값은 상한으로 잘린다", () => {
    // 상한 pct 100 = 배율 2배. 정상 값(10)은 상한에 걸리지 않는다.
    expect(
      normalizeUpHeroState({ combatBuff: { pct: 9999, battlesLeft: 9999 } }).combatBuff,
    ).toEqual({ pct: 100, battlesLeft: 20 });
    expect(
      normalizeUpHeroState({ combatBuff: { pct: 99, battlesLeft: 5 } }).combatBuff,
    ).toEqual({ pct: 99, battlesLeft: 5 });
  });
});

/**
 * Phase 2-A (Track A) — 영웅 XP 풀 와이어 계약. 키는 `heroXp` (iOS UpHeroCloudSchema
 * CodingKeys 와 같은 철자). 없으면 **로컬 유지** (절대 지어내지 않는다 — 0 이나
 * 레거시 공식으로 채우면 두 기기의 풀이 서로를 덮는다). 시드된 뒤엔 0 이어도
 * 항상 인코딩한다 (merge 로 옛 값이 되살아나지 않게).
 */
describe("normalizeUpHeroState — heroXp", () => {
  it("정상 값은 그대로 왕복한다", () => {
    expect(normalizeUpHeroState({ heroXp: 39031 }).heroXp).toBe(39031);
    expect(normalizeUpHeroState({ heroXp: 0 }).heroXp).toBe(0);
  });

  it("키가 없으면 키가 없는 채로 둔다 (로컬 유지 — 절대 지어내지 않는다)", () => {
    const out = normalizeUpHeroState({ coins: 5 });
    expect("heroXp" in out).toBe(false);
    expect(out.heroXp).toBeUndefined();
    // 타입 불일치도 "없음" 으로 — 0 으로 읽으면 Lv47 이 Lv1 로 덮인다.
    expect("heroXp" in normalizeUpHeroState({ heroXp: "많이" })).toBe(false);
    expect("heroXp" in normalizeUpHeroState({ heroXp: NaN })).toBe(false);
  });

  it("음수·소수·상한 초과를 [0, HERO_XP_CAP] 정수로 접는다", () => {
    expect(normalizeUpHeroState({ heroXp: -5 }).heroXp).toBe(0);
    expect(normalizeUpHeroState({ heroXp: 12.7 }).heroXp).toBe(12);
    expect(normalizeUpHeroState({ heroXp: 1e15 }).heroXp).toBe(HERO_XP_CAP);
    expect(HERO_XP_CAP).toBe(331955259);
  });

  it("인코딩은 시드된 0 도 싣는다", () => {
    const payload = encodeUpHeroForCloud(normalizeUpHeroState({ heroXp: 0 }));
    expect(payload.heroXp).toBe(0);
    expect("heroXp" in encodeUpHeroForCloud(normalizeUpHeroState({}))).toBe(false);
  });

  it("heroXp 만으로는 플레이 흔적이 아니다 (footprint 게이트 불변)", () => {
    expect(hasUpHeroFootprint({ heroXp: 39031 })).toBe(false);
  });

  /**
   * iOS UpHeroCloudSchemaTests.WEB_FIXTURE 재생성용 — 픽스처 #1 은 `heroXp: 39031`
   * (레거시 Lv47 시드값) 을 얹는다. 아래 JSON 을 Swift 픽스처에 그대로 붙이면 된다.
   */
  it("픽스처 왕복 — heroXp 39031 이 normalize → encode → normalize 를 지나도 같다", () => {
    const fixture = {
      hero: { name: "테오", classType: null, learnedSkills: ["novice_heal"], skillPoints: 0 },
      inventory: [],
      coins: 264,
      passes: { fitness: 2, learning: 0 },
      dungeons: {
        fitness: { dungeonId: "fitness", floorReached: 12, bestFloorReached: 14, bossesDefeated: [10] },
      },
      codex: { monsters: ["슬라임"], equipment: ["iron_sword"], bosses: [] },
      destroyGuards: 2,
      downGuards: 1,
      combatBuff: { pct: 10, battlesLeft: 3 },
      ngPlusLevel: 1,
      schemaVersion: 6,
      heroStartLevel: 1,
      heroXp: 39031,
    };
    const once = encodeUpHeroForCloud(normalizeUpHeroState(fixture));
    expect(once.heroXp).toBe(39031);
    const twice = encodeUpHeroForCloud(normalizeUpHeroState(JSON.parse(JSON.stringify(once))));
    expect(twice.heroXp).toBe(39031);
    expect(twice).toEqual(once);
  });
});

/**
 * Phase 2-A (Track A) — 클라우드 채택 뒤 시드 업로드의 게이트 통과 계약.
 *
 * `_setFromCloud` 는 (1) 리스너 콜백 안(isUpdatingFromCloud=true) 이나 (2) 부트스트랩의
 * setSyncReady(true) 이전에 불린다. 동기적으로 persist 하면 syncToCloud 가 조용히
 * 버린다 — 그래서 시드(ensureHeroXp)를 microtask 로 미룬다. 여기서는 storage 실물과
 * syncToCloud 실물을 쓰고 Firestore 만 대역으로 바꿔, 업로드 페이로드에 heroXp 가
 * 실제로 실리는지(그리고 동기 persist 는 실리지 않는지) 못박는다.
 */
describe("클라우드 채택 뒤 시드 업로드 — syncToCloud 게이트", () => {
  const validProgress = {
    level: 47,
    xp: 777,
    totalDaysCompleted: 3,
    unlockedCardIds: [],
    categoryCompletions: {},
  };
  const snapshot = (uphero: Record<string, unknown>) => ({
    metadata: { hasPendingWrites: false },
    data: () => ({ progress: validProgress, uphero }),
  });
  /** 리스너 microtask → _setFromCloud microtask → flushSync 의 await 두 단계. */
  async function settle() {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
  function uploadedUpHero(): Array<Record<string, unknown>> {
    return fs.setDoc.mock.calls
      .map((call) => (call as unknown[])[1] as { uphero?: Record<string, unknown> })
      .filter((d) => d.uphero !== undefined)
      .map((d) => d.uphero as Record<string, unknown>);
  }

  /**
   * vitest 의 전역 localStorage 는 node 의 비활성 스텁이라(jsdom 것이 아니다) setItem 이
   * 없다. storage.ts / _setFromCloud 의 bare localStorage 참조가 실제로 동작하도록
   * 인메모리 Storage 로 바꿔 끼운다 (fortune.test.ts 와 같은 패턴).
   */
  function memStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k: string) => m.get(k) ?? null,
      key: (i: number) => Array.from(m.keys())[i] ?? null,
      removeItem: (k: string) => void m.delete(k),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
    } as Storage;
  }

  beforeEach(async () => {
    vi.stubGlobal("localStorage", memStorage());
    fs.setDoc.mockClear();
    fs.snapshotCb = null;
    useUpHeroStore.getState().resetForSignOut();
    const gs = useGameStore.getState();
    useGameStore.setState({ isLoaded: true, progress: { ...gs.progress, level: 47, xp: 777 } });
  });

  afterEach(() => {
    stopListener();
    setSyncReady(false);
    vi.unstubAllGlobals();
  });

  it("리스너 콜백 안의 _setFromCloud — 시드값 39,031 이 microtask 뒤 uphero 페이로드로 올라간다", async () => {
    await startListener("uid-1", (_p, _d, _r, uphero) => {
      useUpHeroStore.getState()._setFromCloud(uphero!);
    });
    setSyncReady(true);
    expect(fs.snapshotCb).not.toBeNull();
    // 구 클라이언트 문서: 흔적(coins 5)은 있고 heroXp 는 없다.
    fs.snapshotCb!(snapshot({ coins: 5, inventory: [] }));
    await settle();
    flushPendingSync();
    await settle();
    const uploads = uploadedUpHero();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].heroXp).toBe(39031);
    expect(uploads[0].coins).toBe(5);
    expect(useUpHeroStore.getState().heroXp).toBe(39031);
  });

  it("리스너 콜백 안의 동기 persist 는 isUpdatingFromCloud 게이트에 막혀 올라가지 않는다 (microtask 가 존재하는 이유)", async () => {
    await startListener("uid-1", (_p, _d, _r, uphero) => {
      // _setFromCloud 없이 콜백 안에서 곧바로 흔적 있는 상태를 persist 한다.
      saveToStorage("uphero", { ...normalizeUpHeroState(uphero), heroXp: 12345 });
    });
    setSyncReady(true);
    fs.snapshotCb!(snapshot({ coins: 5, inventory: [] }));
    await settle();
    flushPendingSync();
    await settle();
    expect(uploadedUpHero()).toHaveLength(0);
    expect(fs.setDoc).not.toHaveBeenCalled();
    // 같은 페이로드를 콜백 밖(게이트 해제 뒤)에서 persist 하면 올라간다 — 대조군.
    saveToStorage("uphero", { coins: 5, inventory: [], heroXp: 12345 });
    flushPendingSync();
    await settle();
    expect(uploadedUpHero().map((u) => u.heroXp)).toEqual([12345]);
  });

  it("부트스트랩 — setSyncReady(true) 이전의 _setFromCloud 도 microtask 시드는 올라간다", async () => {
    await startListener("uid-1", () => {});
    setSyncReady(false);
    useUpHeroStore.getState()._setFromCloud(normalizeUpHeroState({ coins: 5, inventory: [] }));
    // 부트스트랩은 채택 직후 동기적으로 준비 완료를 세운다.
    setSyncReady(true);
    await settle();
    flushPendingSync();
    await settle();
    expect(uploadedUpHero().map((u) => u.heroXp)).toEqual([39031]);
  });
});

/**
 * Phase 6-E (Track E) — overflowDrops / dropFloor 와이어.
 *   iOS UpHeroCloudSchemaTests.WEB_FIXTURE 재생성 #2 — 아래 픽스처 JSON 을 Swift 에
 *   그대로 붙인다 (A 의 #1 상위집합: overflowDrops + dropFloor 추가).
 */
describe("normalizeUpHeroState — overflowDrops / dropFloor (Track E)", () => {
  const item = {
    id: "eq_자기절제의검_rare_1_2",
    baseId: "self_control_sword",
    name: "빛나는 자기절제의 검",
    type: "weapon",
    rarity: "rare",
    category: "fitness",
    iconName: "Sword",
    stats: { str: 24 },
    dropFloor: 20,
    enhanceLevel: 3,
  };

  it("overflowDrops 는 inventory 처럼 디코드되고 dropFloor 가 보존된다", () => {
    const state = normalizeUpHeroState({ overflowDrops: [item], inventory: [item] });
    expect(state.overflowDrops?.length).toBe(1);
    expect(state.overflowDrops?.[0].dropFloor).toBe(20);
    expect(state.inventory?.[0].dropFloor).toBe(20);
    expect(state.overflowDrops?.[0].enhanceLevel).toBe(3);
  });

  it("키가 없거나 배열이 아니면 [] (항상 인코딩)", () => {
    expect(normalizeUpHeroState({}).overflowDrops).toEqual([]);
    expect(normalizeUpHeroState({ overflowDrops: "nope" }).overflowDrops).toEqual([]);
    expect("overflowDrops" in encodeUpHeroForCloud(normalizeUpHeroState({}))).toBe(true);
  });

  it("깨진 원소만 버린다", () => {
    const state = normalizeUpHeroState({ overflowDrops: [item, { id: "x" }, 42] });
    expect(state.overflowDrops?.length).toBe(1);
  });

  it("dropFloor / enhanceLevel 이 숫자가 아니면 버린다 (iOS lenientInt 와 같은 계약, sellPrice NaN 방지)", () => {
    const state = normalizeUpHeroState({
      inventory: [{ ...item, dropFloor: "abc", enhanceLevel: null }],
    });
    const decoded = state.inventory?.[0];
    expect(decoded).toBeDefined();
    expect("dropFloor" in (decoded ?? {})).toBe(false);
    expect("enhanceLevel" in (decoded ?? {})).toBe(false);
  });

  it("overflowDrops 만 있어도 플레이 흔적", () => {
    expect(hasUpHeroFootprint({ overflowDrops: [item] })).toBe(true);
    expect(hasUpHeroFootprint({ overflowDrops: [] })).toBe(false);
  });

  it("픽스처 #2 왕복 — overflowDrops / dropFloor 가 normalize → encode → normalize 를 지나도 같다", () => {
    const fixture = {
      hero: { name: "테오", classType: null, learnedSkills: ["novice_heal"], skillPoints: 0 },
      inventory: [item],
      overflowDrops: [{ ...item, id: "eq_자기절제의검_rare_3_4", dropFloor: 31 }],
      coins: 264,
      passes: { fitness: 2, learning: 0 },
      dungeons: {
        fitness: { dungeonId: "fitness", floorReached: 12, bestFloorReached: 14, bossesDefeated: [10] },
      },
      codex: { monsters: ["슬라임"], equipment: ["자기절제의 검"], bosses: [] },
      destroyGuards: 2,
      downGuards: 1,
      combatBuff: { pct: 10, battlesLeft: 3 },
      ngPlusLevel: 1,
      schemaVersion: 7,
      heroStartLevel: 1,
      heroXp: 39031,
    };
    const once = encodeUpHeroForCloud(normalizeUpHeroState(fixture));
    expect((once.overflowDrops as Array<{ dropFloor?: number }>)[0].dropFloor).toBe(31);
    expect((once.inventory as Array<{ dropFloor?: number }>)[0].dropFloor).toBe(20);
    const twice = encodeUpHeroForCloud(normalizeUpHeroState(JSON.parse(JSON.stringify(once))));
    expect(twice).toEqual(once);
    // iOS 픽스처 재생성용 — 테스트 출력에 남긴다 (실패 시에만 보이는 게 아니라 항상).
    console.info("[WEB_FIXTURE #2]", JSON.stringify(fixture));
  });
});

/**
 * 격자 가방 좌표의 와이어 계약. iOS `CloudEquipment` 가 같은 규칙을 쓰므로
 * 한쪽만 고치면 왕복에서 배치가 조용히 어긋난다.
 *
 * 계약: `n = 유한수 ? floor(n) : 삭제`, bagX 0..4 / bagY 0..7 / bagRot 0..3,
 * bagX 나 bagY 가 무효면 **세 키를 모두** 삭제. 무효 rot 만 0 으로 접는다.
 * 여기서 팩(백필)은 하지 않는다 — 디코드가 좌표를 지어내면 iOS 와 바이트가 갈린다.
 */
describe("normalizeUpHeroState — 장비 좌표·null 키", () => {
  const base = {
    id: "eq-1",
    type: "weapon",
    name: "쇠검",
    category: "fitness",
    rarity: "rare",
    iconName: "Sword",
    stats: { str: 3 },
  };
  const decode = (
    extra: Record<string, unknown>,
  ): Record<string, unknown> | undefined => {
    const decoded = normalizeUpHeroState({ inventory: [{ ...base, ...extra }] });
    const item: unknown = decoded.inventory?.[0];
    return item as Record<string, unknown> | undefined;
  };
  const hasCoords = (item: Record<string, unknown> | undefined) =>
    item !== undefined &&
    ("bagX" in item || "bagY" in item || "bagRot" in item);

  it("null 값 키는 삭제된다 (undefined 대입은 업로드에서 throw 한다)", () => {
    const item = decode({ photoId: null, bagX: null, bagY: null, bagRot: null });
    expect(item).toBeDefined();
    expect("photoId" in (item as object)).toBe(false);
    expect(hasCoords(item)).toBe(false);
  });

  it("소수 좌표는 floor 된다", () => {
    expect(decode({ bagX: 2.7, bagY: 1, bagRot: 0 })).toMatchObject({
      bagX: 2,
      bagY: 1,
      bagRot: 0,
    });
  });

  it("음수·범위 밖·타입 불일치는 세 키를 모두 지운다", () => {
    expect(hasCoords(decode({ bagX: -1, bagY: 1, bagRot: 0 }))).toBe(false);
    expect(hasCoords(decode({ bagX: 99, bagY: 1, bagRot: 0 }))).toBe(false);
    expect(hasCoords(decode({ bagX: 1, bagY: 99, bagRot: 0 }))).toBe(false);
    expect(hasCoords(decode({ bagX: "2", bagY: 1, bagRot: 0 }))).toBe(false);
    expect(hasCoords(decode({ bagX: 1, bagY: NaN, bagRot: 0 }))).toBe(false);
    expect(hasCoords(decode({ bagX: 1e300, bagY: 1, bagRot: 0 }))).toBe(false);
  });

  it("좌표가 유효하면 무효 rot 만 0 으로 접는다", () => {
    expect(decode({ bagX: 1, bagY: 2, bagRot: 7 })).toMatchObject({
      bagX: 1,
      bagY: 2,
      bagRot: 0,
    });
    expect(decode({ bagX: 1, bagY: 2, bagRot: "가로" })).toMatchObject({
      bagRot: 0,
    });
  });

  it("정상 좌표는 그대로 왕복하고, 좌표가 없으면 지어내지 않는다", () => {
    expect(decode({ bagX: 4, bagY: 7, bagRot: 1 })).toMatchObject({
      bagX: 4,
      bagY: 7,
      bagRot: 1,
    });
    expect(hasCoords(decode({}))).toBe(false);
  });
});

/**
 * 가방 확장 (`bagRowsBought`) — 상점에서만 오르는 영구 자산이라 기기를 옮겨도
 * 그대로 따라와야 한다. 와이어 키는 iOS `UpHeroCloudSchema.CodingKeys` 와 같은
 * 철자여야 하고 (화이트리스트 디코드라 어긋나면 조용히 사라진다), 0 에서도
 * 키를 남겨야 한다 — merge 가 클라우드의 옛 행 수를 되살리면 안 되기 때문이다.
 */
describe("normalizeUpHeroState — 가방 확장", () => {
  it("정상 값은 그대로 왕복한다", () => {
    expect(normalizeUpHeroState({ bagRowsBought: 2 }).bagRowsBought).toBe(2);
  });

  it("범위 밖·타입 불일치·부재를 관용적으로 접는다", () => {
    expect(normalizeUpHeroState({ bagRowsBought: 7 }).bagRowsBought).toBe(4);
    expect(normalizeUpHeroState({ bagRowsBought: -1 }).bagRowsBought).toBe(0);
    expect(normalizeUpHeroState({ bagRowsBought: "2" }).bagRowsBought).toBe(0);
    expect(normalizeUpHeroState({ bagRowsBought: 2.9 }).bagRowsBought).toBe(2);
    expect(normalizeUpHeroState({}).bagRowsBought).toBe(0);
  });

  it("0 이어도 페이로드에 실린다 (merge 로 옛 행 수가 부활하면 안 된다)", () => {
    const payload = encodeUpHeroForCloud(normalizeUpHeroState({}));
    expect(Object.keys(payload)).toContain("bagRowsBought");
    expect(payload.bagRowsBought).toBe(0);
  });

  it("행을 한 번이라도 샀으면 그 자체가 플레이 흔적이다", () => {
    // 코인을 써야만 오르는 값이라 갓 설치한 기기에서는 0 일 수밖에 없다.
    expect(hasUpHeroFootprint({ bagRowsBought: 1 })).toBe(true);
    expect(hasUpHeroFootprint({ bagRowsBought: 0 })).toBe(false);
  });
});

/**
 * 격자 가방 병합 — iOS UpHeroCloudSchemaTests.WEB_FIXTURE 재생성 #3 (#2 의 상위집합):
 *   inventory 두 원소에 bagX/bagY/bagRot, `bagRowsBought: 2`, `schemaVersion: 8`.
 *   아래 console.info 출력을 Swift 픽스처에 그대로 붙인다.
 */
describe("픽스처 #3 — 격자 가방 좌표 + bagRowsBought (overflowDrops/dropFloor 상위집합)", () => {
  it("normalize → encode → normalize 를 지나도 같다", () => {
    const fixture = {
      "hero": {
        "name": "테오",
        "hp": 84,
        "maxHp": 120,
        "baseStats": {
          "str": 12,
          "int": 7,
          "vit": 9,
          "dex": 5,
          "agi": 6,
          "crit": 2,
          "slotBonus": 1
        },
        "equipped": {
          "weapon": {
            "id": "sword_f10_1700000000000",
            "name": "eq_iron_sword",
            "baseId": "iron_sword",
            "type": "weapon",
            "rarity": "rare",
            "category": "fitness",
            "iconName": "sword",
            "stats": {
              "str": 4,
              "crit": 1
            },
            "enhanceLevel": 3,
            "affix": "agi",
            "dropFloor": 10
          },
          "armor": null,
          "accessory": null,
          "talisman": {
            "id": "talisman_photo_1700000000001",
            "name": "약속의 부적",
            "type": "talisman",
            "rarity": "unique",
            "category": "mindfulness",
            "iconName": "talisman",
            "stats": {
              "vit": 3
            },
            "photoId": "photo_abc",
            "talismanSkills": [
              "ts_guard"
            ],
            "effects": [
              "eff_1"
            ],
            "flavor": "flavor text"
          }
        },
        "classType": null,
        "appearanceVariant": 1,
        "autoSkillEnabled": false,
        "learnedSkills": [
          "warrior_smash_t1"
        ],
        "skillPoints": 2
      },
      "inventory": [
        {
          "id": "armor_f3_1700000000002",
          "name": "eq_cloth_armor",
          "baseId": "cloth_armor",
          "type": "armor",
          "rarity": "normal",
          "category": "wellness",
          "iconName": "armor",
          "stats": {
            "vit": 2
          },
          "dropFloor": 3,
          "bagX": 0,
          "bagY": 3,
          "bagRot": 0
        },
        {
          "id": "sword_f5_1700000000003",
          "name": "eq_wood_sword",
          "baseId": "wood_sword",
          "type": "weapon",
          "rarity": "normal",
          "category": "fitness",
          "iconName": "sword",
          "stats": {
            "str": 1
          },
          "dropFloor": 5,
          "bagX": 3,
          "bagY": 3,
          "bagRot": 1
        }
      ],
      "overflowDrops": [
        {
          "id": "sword_f31_1700000000003",
          "name": "빛나는 자기절제의 검 of 힘",
          "baseId": "self_control_sword",
          "type": "weapon",
          "rarity": "rare",
          "category": "fitness",
          "iconName": "Sword",
          "stats": {
            "str": 32,
            "int": 2
          },
          "affix": "int",
          "dropFloor": 31
        }
      ],
      "coins": 264,
      "passes": {
        "fitness": 2,
        "learning": 0
      },
      "dungeons": {
        "fitness": {
          "dungeonId": "fitness",
          "floorReached": 12,
          "bestFloorReached": 14,
          "bossesDefeated": [
            10
          ]
        }
      },
      "codex": {
        "monsters": [
          "슬라임"
        ],
        "equipment": [
          "iron_sword"
        ],
        "bosses": []
      },
      "cosmetics": {
        "tentColor": "#CDF564"
      },
      "lastIdleAccrualAt": 1756400000000,
      "ngPlusLevel": 1,
      "destroyGuards": 2,
      "downGuards": 1,
      "combatBuff": {
        "pct": 10,
        "battlesLeft": 3
      },
      "slotBlankStreak": 2,
      "hasSeenCampTutorial": true,
      "welcomeGrantClaimed": true,
      "lastSeenAt": 1756400001000,
      "schemaVersion": 8,
      "shopDaily": {
        "coinPouchClaimed": false,
        "slotSpins": 2,
        "date": "2026-08-28",
        "passesBought": 1
      },
      "weeklyVariant": {
        "week": "2026-W35",
        "affixId": "frenzy",
        "clearedDungeons": [
          "fitness"
        ],
        "bestScore": 3140,
        "lastUploadedAt": 1756400002000
      },
      "heroStartLevel": 3,
      "heroXp": 39031,
      "bagRowsBought": 2
    };
    const once = encodeUpHeroForCloud(normalizeUpHeroState(fixture));
    const inv = once.inventory as Array<Record<string, unknown>>;
    expect(inv[0]).toMatchObject({ bagX: 0, bagY: 3, bagRot: 0, dropFloor: 3 });
    expect(inv[1]).toMatchObject({ bagX: 3, bagY: 3, bagRot: 1, dropFloor: 5 });
    expect(once.bagRowsBought).toBe(2);
    expect((once.overflowDrops as Array<{ dropFloor?: number }>)[0].dropFloor).toBe(31);
    const twice = encodeUpHeroForCloud(normalizeUpHeroState(JSON.parse(JSON.stringify(once))));
    expect(twice).toEqual(once);
    // iOS 픽스처 재생성용 — 인코드 결과(웹 정본 출력)를 남긴다.
    console.info("[WEB_FIXTURE #3]", JSON.stringify(once, null, 2));
  });
});
