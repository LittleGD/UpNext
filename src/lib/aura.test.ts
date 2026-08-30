import { describe, it, expect } from "vitest";
import {
  computeAura, rollTier, auraHintIndex, auraCautionIndex, auraTarotOffer, auraAdviceVariant,
  AURA_WINDOW_DAYS, AURA_HINT_COUNT, TAROT_CARD_COUNT, AURA_ADVICE_VARIANTS,
  type AuraInput, type AuraTier, type AuraKind,
} from "./aura";
import { TAROT_DECK } from "@/data/tarotPool";
import { ALL_CARDS } from "@/data/cards";
import type { Category } from "@/types/card";
import type { DayRecord } from "@/types/game";

const TODAY = "2026-08-27";

function dateBackFrom(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function dateBack(n: number): string {
  return dateBackFrom(TODAY, n);
}
function cardOf(cat: Category): string {
  const c = ALL_CARDS.find((x) => x.category === cat);
  if (!c) throw new Error(`no card for ${cat}`);
  return c.id;
}
function dayAt(today: string, n: number, cats: Category[], opts: Partial<DayRecord> = {}): DayRecord {
  const ids = cats.map(cardOf);
  return {
    date: dateBackFrom(today, n), selectedCardIds: ids, completedCardIds: ids,
    wasFullClear: true, mode: "godlife", ...opts,
  };
}
function day(n: number, cats: Category[], opts: Partial<DayRecord> = {}): DayRecord {
  return dayAt(TODAY, n, cats, opts);
}
function base(over: Partial<AuraInput> = {}): AuraInput {
  return { history: [], checkInDates: [], usedSaverDates: [], streak: 0, duoActive: false, today: TODAY, ...over };
}
function tierOfScore(score: number): AuraTier {
  return score >= 80 ? "great" : score >= 60 ? "good" : score >= 38 ? "fair" : "care";
}
/** 2026-01-01 부터 n 일 연속 날짜 */
function calendar(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2026-01-01T00:00:00");
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

describe("computeAura", () => {
  it("데이터가 없으면 세 기운 모두 낮고 quiet 근거 (salt 없음 = base 경로)", () => {
    const a = computeAura(base());
    for (const k of ["wealth", "relationship", "health"] as const) {
      expect(a[k].score).toBeLessThan(38);
      expect(a[k].tier).toBe("care");
      expect(a[k].omen).toBe("unformed");
    }
  });

  it("결정론 — 같은 입력이면 같은 결과", () => {
    const input = base({ history: [day(1, ["fitness"]), day(2, ["social"])], streak: 3, salt: "device-1" });
    expect(computeAura(input)).toEqual(computeAura(input));
  });

  it("생산성·학습을 많이 하면 재물기운(base)이 오른다", () => {
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

  it("점수는 항상 0~100, tier 는 점수와 정합 (salt 유무 무관)", () => {
    const cases: AuraInput[] = [
      base(),
      base({ history: Array.from({ length: 14 }, (_, i) => day(i + 1, ["productivity","learning","social","fitness"])), streak: 30, duoActive: true, checkInDates: Array.from({ length: 14 }, (_, i) => dateBack(i + 1)) }),
      base({ history: [day(1, ["fitness"], { wasFullClear: false, wasFailed: true })] }),
      base({ salt: "device-1" }),
      base({ history: Array.from({ length: 14 }, (_, i) => day(i + 1, ["productivity","learning"])), streak: 20, salt: "device-2" }),
    ];
    for (const c of cases) {
      const a = computeAura(c);
      for (const k of ["wealth","relationship","health"] as const) {
        const r = a[k];
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(r.tier).toBe(tierOfScore(r.score));
      }
    }
  });

  it("리딩에 수치를 노출할 수 있는 필드가 없다 (점집이 대시보드가 되면 안 된다)", () => {
    const a = computeAura(base({ history: [day(1, ["fitness"])], checkInDates: [dateBack(1)], salt: "device-1" }));
    for (const k of ["wealth", "relationship", "health"] as const) {
      // score 는 내부 계산용이고 화면에 숫자로 내보내지 않는다.
      // stat/window 같은 "실측 수치 전달 필드" 자체를 두지 않아 오용을 원천 차단한다.
      // variant 는 표현 번호(0~2)라 측정값이 아니다 — 어떤 문장을 고를지에만 쓴다.
      // 이 형태(kind/score/tier/omen/variant)는 스냅샷 디코드 하위호환이 걸려 있어 불변이다.
      expect(Object.keys(a[k]).sort()).toEqual(["kind", "omen", "score", "tier", "variant"]);
    }
  });

  it("아주 성실한 유저는 salt 없으면(base 경로) 세 기운이 모두 높다", () => {
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

/**
 * 등급 확률 롤 — 조짐(omen)은 행동의 정직한 거울이고,
 * 등급(tier)은 행동이 확률을 기울인 하늘의 주사위다.
 * 주사위가 등급을 맡아야 습관이 안정된 유저도 매일 다른 하늘을 만나고,
 * 조짐이 행동을 맡아야 "왜 이런 리딩이 나왔나"의 인과가 거짓말이 되지 않는다.
 */
describe("등급 확률 롤 (주사위)", () => {
  it("결정론 — 같은 (base, today, salt, kind)면 같은 결과 (리롤 가챠화 차단)", () => {
    for (const b of [0, 33, 67, 100]) {
      expect(rollTier(b, "2026-08-27", "device-1", "wealth"))
        .toEqual(rollTier(b, "2026-08-27", "device-1", "wealth"));
    }
  });

  it("salt 폴백 — salt 없으면 주사위 없이 tier=tierOf(base), score=base", () => {
    for (const b of [0, 10, 37, 38, 59, 60, 79, 80, 100]) {
      const r = rollTier(b, "2026-08-27", undefined, "wealth");
      expect(r.score).toBe(b);
      expect(r.tier).toBe(tierOfScore(b));
    }
  });

  it("불변식 — 뽑힌 score 는 항상 뽑힌 tier 의 밴드 안 (tierOf(score)==tier)", () => {
    for (const today of calendar(120)) {
      for (const b of [0, 25, 50, 75, 100]) {
        const r = rollTier(b, today, "fixture-salt", "health");
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(tierOfScore(r.score)).toBe(r.tier);
      }
    }
  });

  it("분포 — 365일 동안 base 낮아도/높아도 4개 등급이 전부 등장한다", () => {
    // 성실해도 가끔 흐린 날, 게을러도 가끔 맑은 날 — 그래야 점이다.
    for (const b of [10, 90]) {
      const seen = new Set<AuraTier>();
      for (const today of calendar(365)) seen.add(rollTier(b, today, "fixture-salt", "wealth").tier);
      expect([...seen].sort()).toEqual(["care", "fair", "good", "great"]);
    }
  });

  it("분포 — great 빈도는 base 높은 쪽이 유의하게 크다 (확률을 기울이는 건 행동)", () => {
    const count = (b: number, tier: AuraTier) =>
      calendar(365).filter((t) => rollTier(b, t, "fixture-salt", "wealth").tier === tier).length;
    const lowGreat = count(10, "great");
    const highGreat = count(90, "great");
    expect(highGreat).toBeGreaterThan(lowGreat * 2);
    // 뒤집어서: care 는 base 낮은 쪽이 더 잦다
    expect(count(10, "care")).toBeGreaterThan(count(90, "care"));
  });

  it("분포 — computeAura 통합: 게으른 유저와 성실한 유저 365일", () => {
    const counts = { idle: 0, diligent: 0 };
    for (const today of calendar(365)) {
      const idle = computeAura(base({ today, salt: "fixture-salt" }));
      const diligent = computeAura(base({
        today, salt: "fixture-salt",
        history: Array.from({ length: 14 }, (_, i) => dayAt(today, i + 1, ["productivity", "learning"])),
        checkInDates: Array.from({ length: 14 }, (_, i) => dateBackFrom(today, i + 1)),
        streak: 20,
      }));
      if (idle.wealth.tier === "great") counts.idle++;
      if (diligent.wealth.tier === "great") counts.diligent++;
    }
    expect(counts.idle).toBeGreaterThan(0);        // 게을러도 하늘은 가끔 웃는다
    expect(counts.diligent).toBeGreaterThan(counts.idle * 2); // 하지만 성실 쪽으로 기운다
  });

  it("기운마다 주사위가 따로 구른다 (셋이 함께 움직이는 기계적 인상 방지)", () => {
    const kinds: AuraKind[] = ["wealth", "relationship", "health"];
    const differs = calendar(20).some((today) => {
      const [w, r, h] = kinds.map((k) => rollTier(50, today, "device-1", k).tier);
      return w !== r || r !== h;
    });
    expect(differs).toBe(true);
  });

  /**
   * 패리티 픽스처 — iOS XCTest 가 같은 5벌을 하드코딩한다. 값이 어긋나면
   * 웹/iOS 정수 연산이 갈라진 것이니 스펙(사양 의사코드)부터 다시 대조할 것.
   */
  it("패리티 픽스처 — 고정 (base, today, salt, kind) → (tier, score)", () => {
    const fixtures: [number, string, string, AuraKind, AuraTier, number][] = [
      [20,  "2026-08-27", "device-1", "wealth",       "fair",  47],
      [80,  "2026-08-27", "device-1", "relationship", "good",  64],
      [50,  "2026-09-01", "salt-A",   "health",       "great", 80],
      [0,   "2026-12-31", "s4",       "wealth",       "care",  2],
      [100, "2027-01-01", "zz",       "health",       "great", 81],
    ];
    for (const [b, today, salt, kind, tier, score] of fixtures) {
      expect(rollTier(b, today, salt, kind)).toEqual({ tier, score });
    }
  });
});

describe("문장 변주 (같은 신호라도 매일 같은 문장이 나오면 안 된다)", () => {
  const steady = { history: [1,2,3,4,5].map((n) => day(n, ["fitness", "social"])), streak: 5 };

  it("같은 조짐이라도 날짜가 바뀌면 표현 번호가 달라진다", () => {
    const days = ["2026-08-27","2026-08-28","2026-08-29","2026-08-30","2026-08-31","2026-09-01","2026-09-02"];
    const variants = days.map((d) => computeAura(base({ ...steady, today: d, salt: "device-1" })).health.variant);
    expect(new Set(variants).size).toBeGreaterThan(1);
  });

  it("표현 번호는 항상 0~2", () => {
    for (let i = 1; i <= 28; i++) {
      const a = computeAura(base({ ...steady, today: `2026-09-${String(i).padStart(2, "0")}`, salt: "d" }));
      for (const k of ["wealth","relationship","health"] as const) {
        expect(a[k].variant).toBeGreaterThanOrEqual(0);
        expect(a[k].variant).toBeLessThan(3);
      }
    }
  });

  it("같은 날이면 표현이 고정이다", () => {
    const input = base({ ...steady, today: "2026-08-27", salt: "device-1" });
    expect(computeAura(input).wealth.variant).toBe(computeAura(input).wealth.variant);
  });

  it("기운마다 표현이 따로 움직인다", () => {
    const pairs = ["2026-08-27","2026-08-28","2026-08-29","2026-08-30","2026-08-31"].map((d) => {
      const a = computeAura(base({ ...steady, today: d, salt: "device-1" }));
      return [a.wealth.variant, a.relationship.variant] as const;
    });
    expect(pairs.some(([w, r]) => w !== r)).toBe(true);
  });
});

describe("실마리·흘려보낼 것 선택 인덱스", () => {
  it("항상 0..5 이고 결정론적이다", () => {
    for (const today of calendar(30)) {
      for (const k of ["wealth", "relationship", "health"] as const) {
        const h = auraHintIndex(today, "device-1", k);
        const c = auraCautionIndex(today, "device-1", k);
        for (const v of [h, c]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(AURA_HINT_COUNT);
        }
        expect(auraHintIndex(today, "device-1", k)).toBe(h);
        expect(auraCautionIndex(today, "device-1", k)).toBe(c);
      }
    }
  });

  it("날짜가 바뀌면 인덱스가 돌고, salt 없으면 0", () => {
    const hints = calendar(14).map((t) => auraHintIndex(t, "device-1", "wealth"));
    expect(new Set(hints).size).toBeGreaterThan(1);
    expect(auraHintIndex("2026-08-27", undefined, "wealth")).toBe(0);
    expect(auraCautionIndex("2026-08-27", undefined, "health")).toBe(0);
  });

  it("실마리와 흘려보낼 것은 접두사가 달라 따로 움직인다", () => {
    const differs = calendar(14).some(
      (t) => auraHintIndex(t, "device-1", "wealth") !== auraCautionIndex(t, "device-1", "wealth"),
    );
    expect(differs).toBe(true);
  });
});

/**
 * 타로 제시 — 3장은 하늘(해시)이 고르고, 무엇을 뒤집을지는 유저가 고른다.
 * 정수 연산까지 웹/iOS 동일해야 하는 확정 스펙 — 픽스처는 iOS XCTest 와 공유한다.
 */
describe("타로 제시 3장 (auraTarotOffer)", () => {
  const KINDS: AuraKind[] = ["wealth", "relationship", "health"];

  it("결정론 + 서로 다른 3장 + 0..39 정수", () => {
    for (const today of calendar(60)) {
      for (const k of KINDS) {
        const o = auraTarotOffer(today, "device-1", k);
        expect(auraTarotOffer(today, "device-1", k)).toEqual(o);
        expect(new Set(o).size).toBe(3);
        for (const id of o) {
          expect(Number.isInteger(id)).toBe(true);
          expect(id).toBeGreaterThanOrEqual(0);
          expect(id).toBeLessThan(TAROT_CARD_COUNT);
        }
      }
    }
  });

  it("salt 없으면 [0,1,2] 폴백", () => {
    expect(auraTarotOffer("2026-08-27", undefined, "wealth")).toEqual([0, 1, 2]);
  });

  it("날짜·기운이 바뀌면 제시가 달라진다", () => {
    const byDay = calendar(10).map((t) => auraTarotOffer(t, "device-1", "wealth").join(","));
    expect(new Set(byDay).size).toBeGreaterThan(1);
    const byKind = KINDS.map((k) => auraTarotOffer("2026-08-27", "device-1", k).join(","));
    expect(new Set(byKind).size).toBe(3);
  });

  /**
   * 패리티 픽스처 — iOS XCTest 가 같은 3벌을 하드코딩한다. 값이 어긋나면
   * 웹/iOS 정수 연산이 갈라진 것이니 스펙부터 다시 대조할 것.
   */
  it("패리티 픽스처 — 고정 (today, salt, kind) → 3장", () => {
    expect(auraTarotOffer("2026-08-27", "device-1", "wealth")).toEqual([23, 14, 25]);
    expect(auraTarotOffer("2026-09-01", "salt-A", "relationship")).toEqual([39, 18, 25]);
    expect(auraTarotOffer("2027-01-01", "zz", "health")).toEqual([10, 31, 8]);
  });

  it("TAROT_CARD_COUNT 는 실제 덱 크기·id 배열과 일치한다 (순환 import 회피 상수의 드리프트 방지)", () => {
    expect(TAROT_DECK.length).toBe(TAROT_CARD_COUNT);
    TAROT_DECK.forEach((card, i) => expect(card.id).toBe(i));
  });
});

describe("조언 변주 (auraAdviceVariant — 조짐 variant 와 분리된 6종)", () => {
  it("항상 0..5 이고 결정론적이다", () => {
    for (const today of calendar(30)) {
      for (const k of ["wealth", "relationship", "health"] as const) {
        const v = auraAdviceVariant(today, "device-1", k);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(AURA_ADVICE_VARIANTS);
        expect(auraAdviceVariant(today, "device-1", k)).toBe(v);
      }
    }
  });

  it("salt 없으면 0", () => {
    expect(auraAdviceVariant("2026-08-27", undefined, "wealth")).toBe(0);
  });

  it("6종을 두루 돈다 (조짐 3종 범위 밖의 값도 나온다)", () => {
    const seen = new Set(calendar(120).map((t) => auraAdviceVariant(t, "device-1", "wealth")));
    expect(seen.size).toBe(AURA_ADVICE_VARIANTS);
  });

  /** 패리티 픽스처 — auraTarotOffer 픽스처와 같은 3벌 입력을 iOS XCTest 와 공유. */
  it("패리티 픽스처 — 고정 (today, salt, kind) → 변주 번호", () => {
    expect(auraAdviceVariant("2026-08-27", "device-1", "wealth")).toBe(0);
    expect(auraAdviceVariant("2026-09-01", "salt-A", "relationship")).toBe(2);
    expect(auraAdviceVariant("2027-01-01", "zz", "health")).toBe(5);
  });
});
