import { describe, it, expect } from "vitest";
import {
  SLOT_OUTCOMES,
  SLOT_GRANTS,
  SLOT_DAILY_SPIN_CAP,
  SLOT_PITY_THRESHOLD,
  formatSlotPercent,
  slotOddsRows,
  slotOdds,
  slotRtp,
  type SlotOutcomeId,
} from "./upHeroSlot";
import { slotOddsLabel, type SlotOddsT } from "@/components/uphero/SlotOddsPanel";

/**
 * 확률 공개 UI 의 표시 숫자는 `slotOdds()` / `slotRtp()` 와 일치해야 한다 —
 * 문자열 하드코딩이 아니라 런타임 계산값을 포맷한 것이어야 "공개된 확률이
 * 거짓이 되지 않는다" 가 구조적으로 보장된다.
 */
describe("확률 공개 — 표시값과 계산값의 일치", () => {
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

  it("라벨은 지급 표(SLOT_GRANTS)에서 유도된다 — 결과 모달과 같은 i18n 키·인자", () => {
    const calls: Array<[string, Record<string, string | number> | undefined]> = [];
    const t: SlotOddsT = (key, params) => {
      calls.push([key, params]);
      return key;
    };
    const byId = Object.fromEntries(slotOddsRows().map((r) => [r.id, r])) as Record<
      SlotOutcomeId,
      ReturnType<typeof slotOddsRows>[number]
    >;
    expect(slotOddsLabel(byId.blank, t)).toBe("uphero.slot.odds.blank");
    expect(slotOddsLabel(byId.coinSmall, t)).toBe("uphero.slot.reward.coins");
    expect(slotOddsLabel(byId.destroyProtect, t)).toBe("uphero.slot.reward.destroyGuard");
    expect(slotOddsLabel(byId.rankProtect, t)).toBe("uphero.slot.reward.downGuard");
    expect(slotOddsLabel(byId.itemBox, t)).toBe("uphero.slot.reward.itemBox");
    expect(slotOddsLabel(byId.battleBuff, t)).toBe("uphero.slot.reward.buff");
    // 코인 액면은 표의 지급액 그대로 — 100/250/700 을 문자열로 박지 않는다.
    const coinCalls = calls.filter(([k]) => k === "uphero.slot.reward.coins");
    expect(coinCalls[0][1]).toEqual({
      n: (SLOT_GRANTS.coinSmall as { amount: number }).amount,
    });
    slotOddsLabel(byId.coinJackpot, t);
    expect(calls[calls.length - 1][1]).toEqual({
      n: (SLOT_GRANTS.coinJackpot as { amount: number }).amount,
    });
    slotOddsLabel(byId.battleBuff, t);
    expect(calls[calls.length - 1][1]).toEqual({ pct: 10, battles: 3 });
  });

  it("pity 와 하루 상한 숫자도 상수에서 온다", () => {
    // UI 는 `SLOT_PITY_THRESHOLD - 1` (연속 꽝 횟수) 과 `SLOT_DAILY_SPIN_CAP` 을 넣는다.
    expect(SLOT_PITY_THRESHOLD - 1).toBe(4);
    expect(SLOT_DAILY_SPIN_CAP).toBe(3);
  });
});
