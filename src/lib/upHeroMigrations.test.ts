import { describe, it, expect } from "vitest";
import {
  estimateDropFloor,
  normalizeCodexEquipmentKey,
  repairCodexEquipment,
  repairEquipmentItem,
  repairEquipmentList,
  repairEquippedMap,
} from "./upHeroMigrations";
import { findTemplateByBaseId } from "@/data/upHeroEquipment";
import { enhancePrimaryGrowthTotal, type Equipment } from "@/types/uphero";

/**
 * Phase 6-E (Track E, v7) — 장비/도감 수리 순수 함수.
 *   iconName 리맵 · baseId 시드 · dropFloor 역추정(강화 성장 보정) · 부적 slotBonus ·
 *   도감 키 정규화 · 멱등성.
 */

function legacyRobe(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "eq_침묵의로브_rare_123_45",
    name: "빛나는 침묵의 로브 of 힘",
    rarity: "rare",
    type: "armor",
    category: "mindfulness",
    iconName: "Hanger",
    stats: { int: 14, str: 2 },
    ...overrides,
  };
}

describe("repairEquipmentItem", () => {
  it("legacy id 로 템플릿을 찾아 baseId/iconName/dropFloor 를 채운다", () => {
    const out = repairEquipmentItem(legacyRobe());
    expect(out.baseId).toBe("silence_robe");
    expect(out.iconName).toBe("Shirt");
    // (14 / 1.4 - 5) * 2 = 10 — 부동소수 오차로 9 가 될 수 있어 [9, 10].
    expect(out.dropFloor).toBeGreaterThanOrEqual(9);
    expect(out.dropFloor).toBeLessThanOrEqual(10);
    expect(out.stats.slotBonus).toBeUndefined();
  });

  it("baseId 가 있으면 legacy id 보다 우선한다", () => {
    const out = repairEquipmentItem(legacyRobe({ id: "weird", baseId: "grain_armor" }));
    expect(out.iconName).toBe("Wall");
    expect(out.baseId).toBe("grain_armor");
  });

  it("템플릿을 못 찾으면 ICON_LEGACY_REMAP 폴백, baseId/dropFloor 는 건드리지 않는다", () => {
    const out = repairEquipmentItem(
      legacyRobe({ id: "custom_1", name: "이상한 것", iconName: "Hanger" }),
    );
    expect(out.iconName).toBe("Shirt");
    expect(out.baseId).toBeUndefined();
    expect(out.dropFloor).toBeUndefined();
    const keep = repairEquipmentItem(legacyRobe({ id: "custom_2", iconName: "Sword" }));
    expect(keep.iconName).toBe("Sword");
  });

  it("부적은 slotBonus = max(1, 기존)", () => {
    const t = repairEquipmentItem(
      legacyRobe({
        id: "eq_평정의부적_normal_1_2",
        name: "평정의 부적",
        rarity: "normal",
        type: "talisman",
        iconName: "Moon",
        stats: { agi: 5 },
      }),
    );
    expect(t.stats.slotBonus).toBe(1);
    expect(t.baseId).toBe("serenity_charm");
    const two = repairEquipmentItem(
      legacyRobe({ id: "x", type: "talisman", stats: { agi: 5, slotBonus: 2 } }),
    );
    expect(two.stats.slotBonus).toBe(2);
  });

  it("사진 부적은 photoId/iconName 유지, slotBonus 만 시드", () => {
    const photo: Equipment = {
      id: "photo_talisman_1",
      name: "달리기…",
      rarity: "rare",
      type: "talisman",
      category: "fitness",
      iconName: "Camera",
      stats: { str: 6 },
      photoId: "p-1",
    };
    const out = repairEquipmentItem(photo);
    expect(out.photoId).toBe("p-1");
    expect(out.iconName).toBe("Camera");
    expect(out.baseId).toBeUndefined();
    expect(out.dropFloor).toBeUndefined();
    expect(out.stats.slotBonus).toBe(1);
  });

  it("이미 dropFloor 가 있으면 덮지 않는다", () => {
    expect(repairEquipmentItem(legacyRobe({ dropFloor: 33 })).dropFloor).toBe(33);
  });

  it("입력 객체를 변경하지 않는다", () => {
    const src = legacyRobe();
    repairEquipmentItem(src);
    expect(src.iconName).toBe("Hanger");
    expect(src.baseId).toBeUndefined();
  });
});

describe("estimateDropFloor — 강화 성장 보정 (Track B enhancePrimaryGrowthTotal)", () => {
  const sword = findTemplateByBaseId("self_control_sword")!;

  it("+0 rare F20 드롭을 되돌리면 20", () => {
    // round((5 + 20 * 0.5) * 1.6) = 24
    expect(estimateDropFloor({ stats: { str: 24 }, rarity: "rare" }, sword)).toBe(20);
  });

  it("+15 rare 는 primary 에 growth(15)=10 이 얹혀 있어 그만큼 뺀다", () => {
    const growth = enhancePrimaryGrowthTotal(15);
    expect(growth).toBe(10);
    expect(
      estimateDropFloor({ stats: { str: 24 + growth }, rarity: "rare", enhanceLevel: 15 }, sword),
    ).toBe(20);
    // 보정하지 않았다면 (34/1.6 - 5) * 2 = 32.5 → 33 층으로 틀렸을 것.
    expect(estimateDropFloor({ stats: { str: 24 + growth }, rarity: "rare" }, sword)).toBe(33);
  });

  it("+20 legend 도 primary 성장(15) 을 뺀다", () => {
    // legend mult 3: F30 → round((5 + 15) * 3) = 60; +20 growth 15 → 75
    expect(
      estimateDropFloor({ stats: { str: 75 }, rarity: "legend", enhanceLevel: 20 }, sword),
    ).toBe(30);
  });

  it("[0, 60] clamp, 주스탯 없으면 undefined", () => {
    expect(estimateDropFloor({ stats: { str: 1 }, rarity: "normal" }, sword)).toBe(0);
    expect(estimateDropFloor({ stats: { str: 999 }, rarity: "normal" }, sword)).toBe(60);
    expect(estimateDropFloor({ stats: { int: 9 }, rarity: "normal" }, sword)).toBeUndefined();
  });
});

describe("repairEquipmentList / repairEquippedMap", () => {
  it("배열이 아니면 [], 슬롯 맵은 있는 슬롯만", () => {
    expect(repairEquipmentList(undefined)).toEqual([]);
    expect(repairEquipmentList("x")).toEqual([]);
    expect(repairEquipmentList([legacyRobe()])[0].iconName).toBe("Shirt");
    const eq = repairEquippedMap({ armor: legacyRobe() });
    expect(eq.armor?.iconName).toBe("Shirt");
    expect(eq.weapon).toBeUndefined();
    expect(repairEquippedMap(undefined)).toEqual({});
  });
});

describe("normalizeCodexEquipmentKey / repairCodexEquipment", () => {
  it("접두·강화·affix·legacy id 를 baseName 으로, 모르는 건 버린다", () => {
    expect(
      repairCodexEquipment([
        "자기절제의 검 of 민첩, 힘",
        "빛나는 곡물의 갑옷",
        "eq_지혜의안경_rare_1_2",
        "???",
      ]),
    ).toEqual(["자기절제의 검", "곡물의 갑옷", "지혜의 안경"]);
  });

  it("dedupe 는 순서를 보존한다", () => {
    expect(
      repairCodexEquipment(["곡물의 갑옷", "신성한 곡물의 갑옷 +12", "메모의 펜", "곡물의 갑옷"]),
    ).toEqual(["곡물의 갑옷", "메모의 펜"]);
  });

  it("문자열이 아니면 null / 배열이 아니면 []", () => {
    expect(normalizeCodexEquipmentKey(42)).toBeNull();
    expect(normalizeCodexEquipmentKey("전설적 메모의 펜 +20")).toBe("메모의 펜");
    expect(repairCodexEquipment(null)).toEqual([]);
  });
});

describe("멱등성", () => {
  it("repair(repair(x)) 는 repair(x) 와 deep-equal", () => {
    const items = [
      legacyRobe(),
      legacyRobe({ id: "eq_평정의부적_unique_9_9", type: "talisman", stats: { agi: 20 } }),
      legacyRobe({ id: "custom", iconName: "Grid" }),
    ];
    const once = repairEquipmentList(items);
    const twice = repairEquipmentList(once);
    expect(twice).toEqual(once);
    const keys = ["빛나는 곡물의 갑옷", "eq_지혜의안경_rare_1_2"];
    expect(repairCodexEquipment(repairCodexEquipment(keys))).toEqual(repairCodexEquipment(keys));
  });
});
