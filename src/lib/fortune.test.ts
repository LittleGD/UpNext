import { describe, it, expect } from "vitest";
import { computeDailyFortune } from "./fortune";
import { ALL_CARDS } from "@/data/cards";
import { FORTUNE_COLORS, FORTUNE_PHRASES } from "@/data/fortunePool";
import { QUOTE_POOL } from "@/data/quotePool";

const ALL_IDS = ALL_CARDS.map((c) => c.id);

describe("computeDailyFortune", () => {
  it("같은 날짜·salt 면 항상 같은 결과 (결정론)", () => {
    const a = computeDailyFortune("2026-08-26", "salt-1", ALL_IDS);
    const b = computeDailyFortune("2026-08-26", "salt-1", ALL_IDS);
    expect(a).toEqual(b);
  });

  it("날짜가 바뀌면 결과가 바뀐다", () => {
    const days = ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"];
    const cards = days.map((d) => computeDailyFortune(d, "salt-1", ALL_IDS)?.card.id);
    // 5일 연속 전부 같은 카드일 확률은 무시 가능 — 하나라도 다르면 통과
    expect(new Set(cards).size).toBeGreaterThan(1);
  });

  it("salt 가 다르면 유저마다 다른 카드가 나온다", () => {
    const salts = ["u1", "u2", "u3", "u4", "u5", "u6"];
    const cards = salts.map((s) => computeDailyFortune("2026-08-26", s, ALL_IDS)?.card.id);
    expect(new Set(cards).size).toBeGreaterThan(1);
  });

  it("색·문구·명언이 뽑힌 카드의 카테고리 풀에서 나온다", () => {
    for (let i = 0; i < 120; i++) {
      const f = computeDailyFortune(`2026-08-${(i % 28) + 1}`, `s${i}`, ALL_IDS);
      expect(f).not.toBeNull();
      const cat = f!.card.category;
      expect(FORTUNE_COLORS[cat]).toContainEqual(f!.color);
      expect(FORTUNE_PHRASES[cat]).toContainEqual(f!.phrase);
      expect(QUOTE_POOL[cat]).toContainEqual(f!.quote);
    }
  });

  it("해금 카드가 없으면 null", () => {
    expect(computeDailyFortune("2026-08-26", "salt", [])).toBeNull();
  });

  it("해금 카드 1장뿐이어도 항상 그 카드로 동작한다", () => {
    const one = ALL_IDS[0];
    const f = computeDailyFortune("2026-08-26", "salt", [one]);
    expect(f?.card.id).toBe(one);
  });

  it("색 선택이 한쪽으로 몰리지 않는다 (같은 카테고리 내 3종 모두 등장)", () => {
    // 카테고리를 고정하기 위해 한 카테고리 카드만 해금했다고 가정
    const cat = ALL_CARDS[0].category;
    const ids = ALL_CARDS.filter((c) => c.category === cat).map((c) => c.id);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const f = computeDailyFortune(`2026-09-${(i % 30) + 1}`, `s${i}`, ids);
      if (f) seen.add(f.color.hex);
    }
    expect(seen.size).toBe(FORTUNE_COLORS[cat].length);
  });

  it("모든 카테고리에 색 3종·문구 4종이 채워져 있다", () => {
    const cats = Object.keys(FORTUNE_COLORS) as (keyof typeof FORTUNE_COLORS)[];
    expect(cats.length).toBe(8);
    for (const c of cats) {
      expect(FORTUNE_COLORS[c].length).toBe(3);
      expect(FORTUNE_PHRASES[c].length).toBe(4);
      for (const color of FORTUNE_COLORS[c]) {
        expect(color.hex).toMatch(/^#[0-9A-F]{6}$/i);
        for (const lang of ["ko", "en", "ja", "zh"] as const) {
          expect(color.name[lang].length).toBeGreaterThan(0);
        }
      }
      for (const p of FORTUNE_PHRASES[c]) {
        for (const lang of ["ko", "en", "ja", "zh"] as const) {
          expect(p[lang].length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("QUOTE_POOL 확장 무결성", () => {
  const CATS = Object.keys(QUOTE_POOL) as (keyof typeof QUOTE_POOL)[];

  it("8개 카테고리 모두 충분한 인용을 갖는다", () => {
    expect(CATS.length).toBe(8);
    for (const c of CATS) expect(QUOTE_POOL[c].length).toBeGreaterThanOrEqual(20);
  });

  it("모든 인용이 4개 언어를 빠짐없이 갖는다", () => {
    for (const c of CATS) {
      for (const q of QUOTE_POOL[c]) {
        for (const lang of ["ko", "en", "ja", "zh"] as const) {
          expect(q[lang], `${c}: ${q.ko}`).toBeTruthy();
          expect(q[lang].trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("저자가 붙은 인용은 저자명도 4개 언어를 갖는다", () => {
    let authored = 0;
    for (const c of CATS) {
      for (const q of QUOTE_POOL[c]) {
        if (!q.author) continue;
        authored++;
        for (const lang of ["ko", "en", "ja", "zh"] as const) {
          expect(q.author[lang], `${c}: ${q.ko}`).toBeTruthy();
        }
      }
    }
    // 검증을 통과한 실존 인물 인용이 실제로 들어 있어야 한다
    expect(authored).toBeGreaterThan(50);
  });

  it("같은 카테고리 안에 본문 중복이 없다", () => {
    for (const c of CATS) {
      const kos = QUOTE_POOL[c].map((q) => q.ko.replace(/\s+/g, ""));
      expect(new Set(kos).size, `${c} 중복`).toBe(kos.length);
    }
  });

  it("오늘의 기운이 저자 있는 인용도 뽑는다", () => {
    let withAuthor = 0;
    for (let i = 0; i < 300; i++) {
      const f = computeDailyFortune(`2026-10-${(i % 30) + 1}`, `s${i}`, ALL_IDS);
      if (f?.quote.author) withAuthor++;
    }
    expect(withAuthor).toBeGreaterThan(0);
  });
});
