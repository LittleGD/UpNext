import { describe, it, expect } from "vitest";
import {
  choiceResultIcon,
  deriveChoiceResultMotif,
  deriveChoiceResultTone,
} from "./choiceResultTypes";

/**
 * Phase 4-D (Track D) — 런 한정 효과의 톤/모티프 추론. 결과 모달의 색·아이콘이
 *   여기서 갈린다. 저주는 실제 손해(bane), 나머지 런 효과는 이득(boon).
 */
describe("deriveChoiceResultTone / Motif — 런 한정 효과", () => {
  it("저주만 → bane / curse (Moon)", () => {
    const d = { runMods: [{ stat: "agi" as const, pct: -5, floors: 3 }] };
    expect(deriveChoiceResultTone(d)).toBe("bane");
    expect(deriveChoiceResultMotif(d)).toBe("curse");
    expect(choiceResultIcon("curse", "bane")).toBe("Moon");
  });

  it("버프만 → boon / buff", () => {
    const d = { runMods: [{ stat: "str" as const, pct: 5, floors: 5 }] };
    expect(deriveChoiceResultTone(d)).toBe("boon");
    expect(deriveChoiceResultMotif(d)).toBe("buff");
  });

  it("장비 확정 → boon / gear (다른 런 효과보다 우선)", () => {
    const d = { guaranteedDrop: 1, runMods: [{ stat: "all" as const, pct: -10, floors: 5 }] };
    expect(deriveChoiceResultTone(d)).toBe("boon");
    expect(deriveChoiceResultMotif(d)).toBe("gear");
  });

  it("은신만 → boon / stealth (Eye)", () => {
    const d = { stealth: 1 };
    expect(deriveChoiceResultTone(d)).toBe("boon");
    expect(deriveChoiceResultMotif(d)).toBe("stealth");
    expect(choiceResultIcon("stealth", "boon")).toBe("Eye");
  });

  it("층 건너뜀만 → boon / skip (Forward)", () => {
    const d = { skipFloors: 2 };
    expect(deriveChoiceResultTone(d)).toBe("boon");
    expect(deriveChoiceResultMotif(d)).toBe("skip");
    expect(choiceResultIcon("skip", "boon")).toBe("Forward");
  });

  it("보스 정보 → boon / buff", () => {
    const d = { bossDmgPct: 5 };
    expect(deriveChoiceResultTone(d)).toBe("boon");
    expect(deriveChoiceResultMotif(d)).toBe("buff");
  });

  it("시간 -10 + 은신 1 (긴 우회) 은 이득, 시간 -2 + 저주 (급한 통과) 는 손해", () => {
    expect(deriveChoiceResultTone({ timeDelta: -10, stealth: 1 })).toBe("boon");
    expect(
      deriveChoiceResultTone({
        timeDelta: -2,
        runMods: [{ stat: "dex", pct: -5, floors: 3 }],
      }),
    ).toBe("bane");
  });

  it("기존 수치 경로는 그대로 (피해만 → bane / damage, 코인만 → coin)", () => {
    expect(deriveChoiceResultTone({ damage: 10 })).toBe("bane");
    expect(deriveChoiceResultMotif({ damage: 10 })).toBe("damage");
    expect(deriveChoiceResultMotif({ coins: 30 })).toBe("coin");
    expect(deriveChoiceResultTone(null)).toBe("neutral");
    expect(deriveChoiceResultMotif(undefined)).toBe("generic");
  });
});
