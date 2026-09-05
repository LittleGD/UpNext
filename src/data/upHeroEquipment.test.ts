import { describe, it, expect, afterEach } from "vitest";
import {
  EQUIPMENT_TEMPLATES,
  createEquipmentFromTemplate,
  findTemplateByBaseId,
  getEquipmentBaseName,
  synthesizeEquipment,
} from "./upHeroEquipment";
import { setRngSeed, resetRng } from "@/lib/upHeroRng";
import type { Equipment } from "@/types/uphero";

/**
 * Phase 6-E (Track E) — 장비 템플릿 풀 회귀 테스트.
 *   baseName 복원(피드백 18) · 부적 slotBonus 규칙(21) · dropFloor 기록 · 합성(22).
 */

const tpl = (baseId: string) => {
  const t = findTemplateByBaseId(baseId);
  if (!t) throw new Error(`template ${baseId} missing`);
  return t;
};

function makeItem(overrides: Partial<Equipment>): Equipment {
  return {
    id: "it",
    name: "x",
    type: "weapon",
    rarity: "rare",
    category: "fitness",
    iconName: "Sword",
    stats: { str: 5 },
    ...overrides,
  };
}

describe("getEquipmentBaseName", () => {
  it("baseId 가 있으면 템플릿 baseName (접두·강화·affix 무시)", () => {
    expect(
      getEquipmentBaseName({
        baseId: "self_control_sword",
        name: "신성한 자기절제의 검 of 민첩, 힘 +7",
        rarity: "legend",
      }),
    ).toBe("자기절제의 검");
  });

  it("baseId 가 없으면 접두 → ' +N' → ' of ...' 순으로 벗긴다", () => {
    expect(
      getEquipmentBaseName({ name: "신성한 자기절제의 검 of 민첩, 힘 +7", rarity: "legend" }),
    ).toBe("자기절제의 검");
    expect(getEquipmentBaseName({ name: "빛나는 곡물의 갑옷 of 힘", rarity: "rare" })).toBe(
      "곡물의 갑옷",
    );
    expect(getEquipmentBaseName({ name: "꾸준함의 방패 +3", rarity: "normal" })).toBe(
      "꾸준함의 방패",
    );
  });

  it("normal 무 affix 이름은 그대로", () => {
    expect(getEquipmentBaseName({ name: "메모의 펜", rarity: "normal" })).toBe("메모의 펜");
  });

  it("알 수 없는 baseId 는 이름 규칙으로 폴백", () => {
    expect(
      getEquipmentBaseName({ baseId: "nope", name: "빛나는 지혜의 안경 of 힘", rarity: "rare" }),
    ).toBe("지혜의 안경");
  });
});

describe("createEquipmentFromTemplate — 부적 slotBonus / dropFloor", () => {
  afterEach(() => resetRng());

  it("부적은 normal 에서도 slotBonus 1, dropFloor 는 드롭 층", () => {
    setRngSeed(7);
    const eq = createEquipmentFromTemplate(tpl("serenity_charm"), "normal", 12);
    expect(eq.stats.slotBonus).toBe(1);
    expect(eq.dropFloor).toBe(12);
    expect(eq.baseId).toBe("serenity_charm");
  });

  it("부적은 모든 등급에서 slotBonus 1", () => {
    for (const rarity of ["normal", "rare", "unique", "legend"] as const) {
      setRngSeed(1);
      expect(createEquipmentFromTemplate(tpl("aroma_charm"), rarity, 5).stats.slotBonus).toBe(1);
    }
  });

  it("장신구는 unique+ 에서만 slotBonus", () => {
    setRngSeed(3);
    expect(createEquipmentFromTemplate(tpl("wisdom_glasses"), "normal", 5).stats.slotBonus)
      .toBeUndefined();
    setRngSeed(3);
    expect(createEquipmentFromTemplate(tpl("wisdom_glasses"), "rare", 5).stats.slotBonus)
      .toBeUndefined();
    setRngSeed(3);
    expect(createEquipmentFromTemplate(tpl("wisdom_glasses"), "unique", 5).stats.slotBonus)
      .toBe(1);
  });

  it("무기/갑옷은 slotBonus 없음", () => {
    setRngSeed(3);
    expect(createEquipmentFromTemplate(tpl("self_control_sword"), "legend", 30).stats.slotBonus)
      .toBeUndefined();
  });
});

describe("synthesizeEquipment", () => {
  afterEach(() => resetRng());

  const sources = () => [
    makeItem({ id: "a", rarity: "rare", category: "fitness", dropFloor: 12, enhanceLevel: 4 }),
    makeItem({ id: "b", rarity: "rare", category: "learning", dropFloor: 20, enhanceLevel: 9 }),
    makeItem({ id: "c", rarity: "rare", category: "learning", dropFloor: 15 }),
  ];

  it("rare ×3 → unique, dropFloor 는 max, 강화 단계 소실, 카테고리 합집합 풀", () => {
    setRngSeed(4242);
    const out = synthesizeEquipment(sources());
    expect(out).not.toBeNull();
    if (!out) return;
    expect(out.rarity).toBe("unique");
    expect(out.dropFloor).toBe(20);
    expect(out.enhanceLevel).toBeUndefined();
    expect(out.enhanceFailStreak).toBeUndefined();
    expect(["fitness", "learning"]).toContain(out.category);
    const pool = EQUIPMENT_TEMPLATES.filter((t) =>
      ["fitness", "learning"].includes(t.category),
    ).map((t) => t.baseId);
    expect(pool).toContain(out.baseId);
  });

  it("같은 시드면 같은 결과 (id 제외)", () => {
    setRngSeed(99);
    const a = synthesizeEquipment(sources());
    setRngSeed(99);
    const b = synthesizeEquipment(sources());
    expect(a && { ...a, id: "" }).toEqual(b && { ...b, id: "" });
  });

  it("legend / 등급 불일치 / 사진 부적 / 개수 ≠ 3 → null", () => {
    setRngSeed(1);
    expect(synthesizeEquipment(sources().map((s) => ({ ...s, rarity: "legend" as const }))))
      .toBeNull();
    const mixed = sources();
    mixed[1] = { ...mixed[1], rarity: "unique" };
    expect(synthesizeEquipment(mixed)).toBeNull();
    const photo = sources();
    photo[2] = { ...photo[2], photoId: "p1", type: "talisman" };
    expect(synthesizeEquipment(photo)).toBeNull();
    expect(synthesizeEquipment(sources().slice(0, 2))).toBeNull();
    expect(synthesizeEquipment([...sources(), makeItem({ id: "d" })])).toBeNull();
  });

  it("unique ×3 → legend", () => {
    setRngSeed(5);
    const out = synthesizeEquipment(
      sources().map((s) => ({ ...s, rarity: "unique" as const })),
    );
    expect(out?.rarity).toBe("legend");
  });
});
