import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EQUIPMENT_TEMPLATES, ICON_LEGACY_REMAP } from "./upHeroEquipment";
import { SLOT_GLYPH } from "@/lib/equipmentSlotMeta";

/**
 * Phase 6-E (Track E, 피드백 9) — 모든 iconName 이 실제 pixelarticons 2.x 파일이어야 한다.
 * 옛 이름 10개(Armor/EyeClosed/Edit/Sun/Hanger/Fork/Star/Tool/Grid/Flash) 는 존재하지
 * 않아 아이콘이 통째로 안 그려졌다. 이 테스트가 다시는 그런 이름이 들어오지 못하게 막는다.
 */
const ICON_DIR = path.join(process.cwd(), "node_modules/pixelarticons/react");
const exists = (name: string) => fs.existsSync(path.join(ICON_DIR, `${name}.js`));

describe("장비 아이콘 — pixelarticons 존재 확인", () => {
  it("모든 템플릿 iconName 이 존재한다", () => {
    for (const t of EQUIPMENT_TEMPLATES) {
      expect(exists(t.iconName), `${t.baseId}: ${t.iconName}`).toBe(true);
    }
  });

  it("슬롯 글리프 4종이 존재한다", () => {
    for (const [slot, name] of Object.entries(SLOT_GLYPH)) {
      expect(exists(name), `${slot}: ${name}`).toBe(true);
    }
  });

  it("레거시 리맵의 목적지가 전부 존재하고, 출발지는 존재하지 않는다 (리맵이 필요한 이유)", () => {
    for (const [from, to] of Object.entries(ICON_LEGACY_REMAP)) {
      expect(exists(to), `${from} -> ${to}`).toBe(true);
      expect(exists(from), `${from} should be missing in pixelarticons 2.x`).toBe(false);
    }
  });

  it("리맵 표의 12개 템플릿이 새 이름을 쓴다", () => {
    const expected: Record<string, string> = {
      endurance_bracer: "Hand",
      wisdom_glasses: "Sunglasses",
      memo_pen: "PenSquare",
      zen_beads: "CirclePile",
      silence_robe: "Shirt",
      grain_armor: "Wall",
      friendship_cape: "Flag",
      moderation_spoon: "Pipette",
      aroma_charm: "Potion",
      efficiency_axe: "Cut",
      timeblock_charm: "Grid3x3",
      mutation_charm: "Shuffle",
      smile_ring: "Smile",
      deepsleep_charm: "Bed",
    };
    for (const [baseId, icon] of Object.entries(expected)) {
      const t = EQUIPMENT_TEMPLATES.find((x) => x.baseId === baseId);
      expect(t?.iconName, baseId).toBe(icon);
    }
  });

  it("갑옷 3종(Shirt/Wall/Flag) 은 서로 다른 글리프", () => {
    const armorIcons = EQUIPMENT_TEMPLATES.filter((t) => t.type === "armor").map(
      (t) => t.iconName,
    );
    expect(new Set(armorIcons).size).toBe(armorIcons.length);
    expect(armorIcons).toEqual(expect.arrayContaining(["Shirt", "Wall", "Flag"]));
  });

  it("옛 이름은 어느 템플릿에도 남아 있지 않다", () => {
    const legacy = new Set(Object.keys(ICON_LEGACY_REMAP));
    for (const t of EQUIPMENT_TEMPLATES) {
      expect(legacy.has(t.iconName), t.baseId).toBe(false);
    }
  });
});
