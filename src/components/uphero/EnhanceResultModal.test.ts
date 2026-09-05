import { describe, it, expect, beforeAll } from "vitest";
import { ensureLanguage } from "@/i18n";
import { enhanceStatLabel } from "./EnhanceResultModal";

/**
 * 강화 성공 모달의 스탯 한 줄 — 6대 스탯은 약어(STR/…), slotBonus 같은 나머지 키는
 * 카탈로그 라벨(uphero.affixStat.*)을 쓴다. 리뷰 지적: 부적/유니크 악세서리마다
 * "SLOTBONUS +1" 이 사용자에게 노출되던 회귀 방지.
 */
describe("enhanceStatLabel", () => {
  beforeAll(async () => {
    // dict 는 lazy import 라 ko 외 언어는 먼저 적재해야 t() 가 해당 언어를 돌려준다.
    await Promise.all((["en", "ja", "zh"] as const).map((l) => ensureLanguage(l)));
  });

  it("6대 스탯은 언어와 무관하게 대문자 약어", () => {
    for (const k of ["str", "int", "vit", "dex", "agi", "crit"]) {
      expect(enhanceStatLabel(k, "ko")).toBe(k.toUpperCase());
      expect(enhanceStatLabel(k, "en")).toBe(k.toUpperCase());
    }
  });

  it("slotBonus 는 raw key 가 아니라 4개 언어 카탈로그 라벨", () => {
    expect(enhanceStatLabel("slotBonus", "ko")).toBe("슬롯");
    expect(enhanceStatLabel("slotBonus", "en")).toBe("Slot");
    expect(enhanceStatLabel("slotBonus", "ja")).toBe("スロット");
    expect(enhanceStatLabel("slotBonus", "zh")).toBe("槽位");
    for (const lang of ["ko", "en", "ja", "zh"] as const) {
      const label = enhanceStatLabel("slotBonus", lang);
      expect(label).not.toBe("slotBonus");
      expect(label).not.toBe("SLOTBONUS");
      expect(label).not.toMatch(/^uphero\./);
    }
  });
});
