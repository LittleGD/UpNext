import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeDailyFortune,
  markAuraTarot,
  readAuraState,
  readFortuneState,
} from "./fortune";
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

/**
 * 타로 선택 저장 — 선택은 유저 몫이지만 하루 고정(재선택 불가)이고,
 * auraDate 롤오버 시 열람 기록·스냅샷과 함께 소거된다. jsdom localStorage 사용.
 */
describe("auraTarot 상태 (하루 고정·롤오버 소거·관용 디코드)", () => {
  const KEY = "upnext_fortune";

  /**
   * vitest 의 전역 localStorage 는 node 의 비활성 스텁이라(jsdom 것이 아니다)
   * setItem 이 없다. fortune.ts 의 bare localStorage 참조가 실제로 동작하도록
   * 인메모리 구현을 스텁한다 — 테스트마다 새로 깔아 상태 누수를 막는다.
   */
  function memStorage(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal("localStorage", memStorage());
    localStorage.setItem(KEY, JSON.stringify({ salt: "s" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("선택을 저장하고, 같은 날 같은 기운의 재선택은 첫 값이 이긴다", () => {
    expect(markAuraTarot("2026-08-27", "wealth", 7)).toBe(7);
    expect(readAuraState("2026-08-27").tarot.wealth).toBe(7);
    expect(markAuraTarot("2026-08-27", "wealth", 30)).toBe(7);
    expect(readAuraState("2026-08-27").tarot.wealth).toBe(7);
  });

  it("기운별로 독립 저장된다", () => {
    markAuraTarot("2026-08-27", "wealth", 7);
    markAuraTarot("2026-08-27", "health", 3);
    expect(readAuraState("2026-08-27").tarot).toEqual({ wealth: 7, health: 3 });
    expect(readAuraState("2026-08-27").tarot.relationship).toBeUndefined();
  });

  it("날짜가 넘어가면 어제 선택은 읽히지 않고, 다음 기록이 저장소에서도 밀어낸다", () => {
    markAuraTarot("2026-08-27", "wealth", 7);
    expect(readAuraState("2026-08-28").tarot).toEqual({});
    markAuraTarot("2026-08-28", "wealth", 1);
    const raw = JSON.parse(localStorage.getItem(KEY)!) as Record<string, unknown>;
    expect(raw.auraDate).toBe("2026-08-28");
    expect(raw.auraTarot).toEqual({ wealth: 1 });
  });

  it("관용 디코드 — 0..39 정수만 인정하고 어긋난 기운만 버린다", () => {
    localStorage.setItem(KEY, JSON.stringify({
      salt: "s",
      auraDate: "2026-08-27",
      auraTarot: { wealth: 12, relationship: 40, health: "3" },
    }));
    expect(readFortuneState().auraTarot).toEqual({ wealth: 12 });
  });

  it("관용 디코드 — 전부 어긋나면 필드째 버린다", () => {
    for (const bad of [{ wealth: -1 }, "junk", 3, null, { wealth: 1.5 }]) {
      localStorage.setItem(KEY, JSON.stringify({ salt: "s", auraDate: "2026-08-27", auraTarot: bad }));
      expect(readFortuneState().auraTarot).toBeUndefined();
    }
  });

  it("범위 밖 cardId 는 기록하지 않는다 (auraTarotOffer 산출값만 오는 경로의 방어선)", () => {
    markAuraTarot("2026-08-27", "wealth", 40);
    markAuraTarot("2026-08-27", "wealth", -1);
    markAuraTarot("2026-08-27", "wealth", 2.5);
    expect(readAuraState("2026-08-27").tarot).toEqual({});
  });
});
