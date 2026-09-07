import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  SLOT_OUTCOMES,
  SLOT_GRANTS,
  SLOT_DAILY_SPIN_CAP,
  SLOT_PITY_THRESHOLD,
  formatSlotPercent,
  slotOddsRows,
  slotOdds,
  slotRtp,
} from "./upHeroSlot";
import ko from "@/i18n/ko";

/**
 * 확률·환수율 회계는 엔진에 그대로 남아 있다 (밸런싱과 테스트가 표와 지급의
 * 일치를 검사한다). 다만 **화면에는 더 이상 나오지 않는다** — 2026-09 애플
 * 2.3.6 대응으로 확률 공개 패널을 걷어냈다. 이 파일이 두 사실을 함께 고정한다.
 */
describe("확률 회계 — 표와 지급의 일치", () => {
  it("표의 각 줄은 slotOdds() 와 같은 확률을 갖고 SLOT_OUTCOMES 순서를 따른다", () => {
    const rows = slotOddsRows();
    const odds = slotOdds();
    expect(rows.map((r) => r.id)).toEqual(SLOT_OUTCOMES.map((o) => o.id));
    for (const row of rows) {
      expect(row.probability).toBe(odds[row.id]);
      expect(row.grant).toBe(SLOT_GRANTS[row.id]);
    }
    expect(rows.reduce((sum, r) => sum + r.probability, 0)).toBeCloseTo(1, 9);
  });

  it("퍼센트 포맷은 값을 잃지 않는다 — 파싱해 되돌리면 원래 확률 (‰ 단위 정확)", () => {
    for (const row of slotOddsRows()) {
      const text = formatSlotPercent(row.probability);
      expect(text.endsWith("%")).toBe(true);
      expect(parseFloat(text) / 100).toBeCloseTo(row.probability, 9);
    }
    // RTP 는 소수 둘째 자리가 정확한 값이라 그대로 살아야 한다.
    expect(parseFloat(formatSlotPercent(slotRtp())) / 100).toBeCloseTo(slotRtp(), 9);
    expect(formatSlotPercent(slotRtp())).toBe("92.75%");
  });

  it("포맷 예시 — 뒤따르는 0 은 지우고, 최대 소수 둘째 자리", () => {
    expect(formatSlotPercent(0.49)).toBe("49%");
    expect(formatSlotPercent(0.194)).toBe("19.4%");
    expect(formatSlotPercent(0.009)).toBe("0.9%");
    expect(formatSlotPercent(0.9275)).toBe("92.75%");
    expect(formatSlotPercent(1)).toBe("100%");
    expect(formatSlotPercent(0)).toBe("0%");
  });

  it("확률 공개 UI 는 앱에서 사라졌다 — 컴포넌트도 문구 키도 없다", () => {
    // 2.3.6: 지급표·환수율·"확률 보기" 는 도박 신호의 핵심이라 화면에서 제거했다.
    expect(existsSync(resolve(__dirname, "../components/uphero/SlotOddsPanel.tsx"))).toBe(
      false,
    );
    const dict = ko as Record<string, string>;
    for (const key of Object.keys(dict)) {
      expect(key.startsWith("uphero.slot.odds.")).toBe(false);
    }
  });

  it("pity 와 하루 상한 숫자는 상수에서 온다", () => {
    expect(SLOT_PITY_THRESHOLD - 1).toBe(4);
    expect(SLOT_DAILY_SPIN_CAP).toBe(3);
  });
});
