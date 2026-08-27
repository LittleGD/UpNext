import { describe, it, expect } from "vitest";
import { computeAura, AURA_WINDOW_DAYS, type AuraInput } from "./aura";
import { ALL_CARDS } from "@/data/cards";
import type { Category } from "@/types/card";
import type { DayRecord } from "@/types/game";

const TODAY = "2026-08-27";

function dateBack(n: number): string {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function cardOf(cat: Category): string {
  const c = ALL_CARDS.find((x) => x.category === cat);
  if (!c) throw new Error(`no card for ${cat}`);
  return c.id;
}
function day(n: number, cats: Category[], opts: Partial<DayRecord> = {}): DayRecord {
  const ids = cats.map(cardOf);
  return {
    date: dateBack(n), selectedCardIds: ids, completedCardIds: ids,
    wasFullClear: true, mode: "godlife", ...opts,
  };
}
function base(over: Partial<AuraInput> = {}): AuraInput {
  return { history: [], checkInDates: [], usedSaverDates: [], streak: 0, duoActive: false, today: TODAY, ...over };
}

describe("computeAura", () => {
  it("데이터가 없으면 세 기운 모두 낮고 quiet 근거", () => {
    const a = computeAura(base());
    for (const k of ["wealth", "relationship", "health"] as const) {
      expect(a[k].score).toBeLessThan(38);
      expect(a[k].tier).toBe("care");
      expect(a[k].omen).toBe("unformed");
    }
  });

  it("결정론 — 같은 입력이면 같은 결과", () => {
    const input = base({ history: [day(1, ["fitness"]), day(2, ["social"])], streak: 3 });
    expect(computeAura(input)).toEqual(computeAura(input));
  });

  it("생산성·학습을 많이 하면 재물기운이 오른다", () => {
    const idle = computeAura(base());
    const busy = computeAura(base({
      history: [0,1,2,3,4,5].map((n) => day(n + 1, ["productivity", "learning"])),
      streak: 6,
    }));
    expect(busy.wealth.score).toBeGreaterThan(idle.wealth.score + 30);
    expect(busy.wealth.omen).toBe("closing");
  });

  it("소통 카드와 2인 불꽃이 관계기운을 올린다", () => {
    const alone = computeAura(base({ history: [day(1, ["fitness"])] }));
    const social = computeAura(base({
      history: [day(1, ["social"]), day(2, ["social"]), day(3, ["trending"])],
      duoActive: true,
    }));
    expect(social.relationship.score).toBeGreaterThan(alone.relationship.score);
    expect(social.relationship.omen).toBe("gathering");
  });

  it("체크인 규칙성이 건강기운의 주 신호", () => {
    const dates = Array.from({ length: 10 }, (_, i) => dateBack(i + 1));
    const a = computeAura(base({ checkInDates: dates }));
    expect(a.health.omen).toBe("rhythm");
    expect(a.health.score).toBeGreaterThan(38);
  });

  it("방패로 쉬어간 날은 감점하지 않는다 (쉬는 것도 관리)", () => {
    const dates = Array.from({ length: 8 }, (_, i) => dateBack(i + 1));
    const noRest = computeAura(base({ checkInDates: dates }));
    const rested = computeAura(base({ checkInDates: dates, usedSaverDates: [dateBack(3), dateBack(5)] }));
    expect(rested.health.score).toBe(noRest.health.score);
  });

  it("실패일은 건강기운을 약하게 낮춘다", () => {
    const hist = [1,2,3,4].map((n) => day(n, ["fitness"]));
    const clean = computeAura(base({ history: hist, checkInDates: [dateBack(1), dateBack(2)] }));
    const failed = computeAura(base({
      history: hist.map((d, i) => (i < 2 ? { ...d, wasFailed: true } : d)),
      checkInDates: [dateBack(1), dateBack(2)],
    }));
    expect(failed.health.score).toBeLessThan(clean.health.score);
  });

  it("관측 창 밖의 기록은 무시한다", () => {
    const old = computeAura(base({ history: [day(AURA_WINDOW_DAYS + 5, ["productivity", "learning"])] }));
    expect(old.wealth.omen).toBe("unformed");
  });

  it("점수는 항상 0~100, tier 는 점수와 정합", () => {
    const cases: AuraInput[] = [
      base(),
      base({ history: Array.from({ length: 14 }, (_, i) => day(i + 1, ["productivity","learning","social","fitness"])), streak: 30, duoActive: true, checkInDates: Array.from({ length: 14 }, (_, i) => dateBack(i + 1)) }),
      base({ history: [day(1, ["fitness"], { wasFullClear: false, wasFailed: true })] }),
    ];
    for (const c of cases) {
      const a = computeAura(c);
      for (const k of ["wealth","relationship","health"] as const) {
        const r = a[k];
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        const expected = r.score >= 80 ? "great" : r.score >= 60 ? "good" : r.score >= 38 ? "fair" : "care";
        expect(r.tier).toBe(expected);
      }
    }
  });

  it("리딩에 수치를 노출할 수 있는 필드가 없다 (점집이 대시보드가 되면 안 된다)", () => {
    const a = computeAura(base({ history: [day(1, ["fitness"])], checkInDates: [dateBack(1)] }));
    for (const k of ["wealth", "relationship", "health"] as const) {
      // score 는 내부 계산용이고 화면에 숫자로 내보내지 않는다.
      // stat/window 같은 "실측 수치 전달 필드" 자체를 두지 않아 오용을 원천 차단한다.
      expect(Object.keys(a[k]).sort()).toEqual(["kind", "omen", "score", "tier"]);
    }
  });

  describe("하루치 흔들림 (점의 요소)", () => {
    const steady = { history: [1,2,3,4,5].map((n) => day(n, ["fitness", "social"])), streak: 5 };

    it("salt 가 없으면 흔들림이 0 이라 salt 유무로만 값이 갈린다", () => {
      const plain = computeAura(base({ ...steady }));
      const again = computeAura(base({ ...steady }));
      expect(plain.wealth.score).toBe(again.wealth.score);
      // salt 를 주면 흔들림이 붙어 (대개) 값이 달라진다
      const swayedScores = ["s1","s2","s3","s4"].map(
        (sl) => computeAura(base({ ...steady, salt: sl })).wealth.score,
      );
      expect(swayedScores.some((v) => v !== plain.wealth.score)).toBe(true);
    });

    it("같은 행동이라도 날짜가 바뀌면 점수가 달라진다", () => {
      const days = ["2026-08-27","2026-08-28","2026-08-29","2026-08-30","2026-08-31","2026-09-01"];
      const scores = days.map((d) => computeAura(base({ ...steady, today: d, salt: "device-1" })).wealth.score);
      expect(new Set(scores).size).toBeGreaterThan(1);
    });

    it("같은 날 같은 기기면 값이 고정이다 (재렌더에 흔들리지 않는다)", () => {
      const input = base({ ...steady, today: "2026-08-27", salt: "device-1" });
      expect(computeAura(input)).toEqual(computeAura(input));
    });

    it("기기마다 다른 결과가 나온다", () => {
      const salts = ["a","b","c","d","e","f"];
      const scores = salts.map((sl) => computeAura(base({ ...steady, today: "2026-08-27", salt: sl })).wealth.score);
      expect(new Set(scores).size).toBeGreaterThan(1);
    });

    it("세 기운이 함께 움직이지 않는다 (기계적 인상 방지)", () => {
      const deltas = ["2026-08-27","2026-08-28","2026-08-29","2026-08-30"].map((d) => {
        const plain = computeAura(base({ ...steady, today: d }));
        const swayed = computeAura(base({ ...steady, today: d, salt: "device-1" }));
        return {
          w: swayed.wealth.score - plain.wealth.score,
          r: swayed.relationship.score - plain.relationship.score,
        };
      });
      // 재물과 관계의 흔들림이 항상 같지는 않아야 한다
      expect(deltas.some((d) => d.w !== d.r)).toBe(true);
    });

    it("흔들림이 신호를 뒤집지 않는다 (행동이 여전히 지배적)", () => {
      const lazy = base({ today: "2026-08-27", salt: "x" });
      const diligent = base({
        history: Array.from({ length: 14 }, (_, i) => day(i + 1, ["productivity","learning"])),
        checkInDates: Array.from({ length: 14 }, (_, i) => dateBack(i + 1)),
        streak: 20, today: "2026-08-27", salt: "x",
      });
      expect(computeAura(diligent).wealth.score)
        .toBeGreaterThan(computeAura(lazy).wealth.score + 20);
    });

    it("흔들려도 0~100 을 벗어나지 않는다", () => {
      for (let i = 0; i < 40; i++) {
        const a = computeAura(base({ ...steady, today: `2026-09-${(i % 30) + 1}`.replace(/-(\d)$/, "-0$1"), salt: `s${i}` }));
        for (const k of ["wealth","relationship","health"] as const) {
          expect(a[k].score).toBeGreaterThanOrEqual(0);
          expect(a[k].score).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  it("아주 성실한 유저는 세 기운이 모두 높다", () => {
    const a = computeAura(base({
      history: Array.from({ length: 14 }, (_, i) => day(i + 1, ["productivity","learning","social","fitness","wellness"])),
      checkInDates: Array.from({ length: 14 }, (_, i) => dateBack(i + 1)),
      streak: 20, duoActive: true,
    }));
    expect(a.wealth.tier === "great" || a.wealth.tier === "good").toBe(true);
    expect(a.relationship.tier).toBe("great");
    expect(a.health.tier).toBe("great");
  });
});
