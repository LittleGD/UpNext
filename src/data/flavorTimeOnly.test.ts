import { describe, it, expect } from "vitest";
import { EVENT_POOL, UNIVERSAL_EVENTS } from "./upHeroFlavor";
import { MYSTERY_EVENTS } from "./flavor/mystery";
import type { DungeonEvent } from "./flavor/_types";
import type { ChoiceEffect } from "@/types/uphero";

/**
 * Phase 4-D (Track D, 피드백 35) — "시간만 깎이는" 결과 금지 가드.
 *
 *   이전엔 55 개 outcome 이 `[{ kind: "time", delta: -N }]` 하나뿐이라 "피해서
 *   간다" 선택이 순수 손해였다. 이제 모든 그런 결과에는 밴드 규칙으로 런 한정
 *   효과가 붙어 있다 (|N|<=2 저주, 3..7 던전 스탯 버프, >=8 은신; mystery 는 강화판).
 *   데이터가 다시 그 상태로 돌아가지 않게 막고, 런 효과 수치 범위도 고정한다.
 */

const ALL_EVENTS: DungeonEvent[] = [
  ...Object.values(EVENT_POOL).flat(),
  ...UNIVERSAL_EVENTS,
  ...MYSTERY_EVENTS,
];

function isNegativeTimeOnly(effects: readonly ChoiceEffect[]): boolean {
  return (
    effects.length > 0 &&
    effects.every((e) => e.kind === "time" && e.delta < 0)
  );
}

function* walkEffects(): Generator<{ where: string; effects: readonly ChoiceEffect[] }> {
  for (const ev of ALL_EVENTS) {
    for (const [oi, opt] of ev.options.entries()) {
      if (opt.effect) {
        yield { where: `${ev.prompt} / opt${oi} / effect`, effects: [opt.effect] };
      }
      for (const [ri, out] of (opt.outcomes ?? []).entries()) {
        yield { where: `${ev.prompt} / opt${oi} / out${ri}`, effects: out.effects };
      }
    }
  }
}

describe("flavor — time-only 결과 없음", () => {
  it("음수 시간만으로 이뤄진 outcome / legacy effect 가 0 건", () => {
    const offenders: string[] = [];
    for (const { where, effects } of walkEffects()) {
      if (isNegativeTimeOnly(effects)) offenders.push(where);
    }
    expect(offenders).toEqual([]);
  });

  it("런 한정 효과 수치 범위 — pct 1..25, floors 1..10 또는 없음, 은신 1..3", () => {
    let runCount = 0;
    let stealthCount = 0;
    for (const { effects } of walkEffects()) {
      for (const e of effects) {
        if (e.kind === "runBuff" || e.kind === "runCurse") {
          runCount += 1;
          expect(e.pct).toBeGreaterThanOrEqual(1);
          expect(e.pct).toBeLessThanOrEqual(25);
          if (e.floors != null) {
            expect(e.floors).toBeGreaterThanOrEqual(1);
            expect(e.floors).toBeLessThanOrEqual(10);
          }
        } else if (e.kind === "stealth") {
          stealthCount += 1;
          expect(e.encounters).toBeGreaterThanOrEqual(1);
          expect(e.encounters).toBeLessThanOrEqual(3);
        }
      }
    }
    // 밴드 규칙으로 재작성한 55 곳: 저주 33 + 버프 11 + 은신 11.
    expect(runCount).toBe(44);
    expect(stealthCount).toBe(11);
  });
});
