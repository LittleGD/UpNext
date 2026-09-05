import { describe, it, expect } from "vitest";
import { normalizeUpHeroState, hasUpHeroFootprint, encodeUpHeroForCloud } from "./sync";
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
