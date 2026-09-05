import { describe, it, expect } from "vitest";
import { normalizeUpHeroState, hasUpHeroFootprint } from "./sync";
import { ENHANCE_GUARD_MAX } from "@/types/uphero";

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
