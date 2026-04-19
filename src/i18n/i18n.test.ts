import { describe, it, expect, beforeAll } from "vitest";
import { t, ensureLanguage } from "./index";
import ko from "./ko";
import en from "./en";
import ja from "./ja";
import zh from "./zh";

// Phase 14 code-review High #12 — i18n 이 lazy-loaded 로 전환됐으므로
//   t() 가 non-ko dict 를 참조하려면 ensureLanguage 로 preload 필요.
beforeAll(async () => {
  await Promise.all([
    ensureLanguage("en"),
    ensureLanguage("ja"),
    ensureLanguage("zh"),
  ]);
});

/**
 * Phase 13 review — i18n dictionary 일관성 + placeholder 토큰 테스트.
 *   CI 의 check-i18n-placeholders.ts 와 유사하지만 vitest 로 통합해
 *   `npm test` 만으로 완전한 커버리지.
 */

describe("i18n dictionaries", () => {
  it("모든 dict 가 동일한 키 집합을 가짐 (Record<DictKey, string> 강제 외 추가 확인)", () => {
    const koKeys = Object.keys(ko).sort();
    const enKeys = Object.keys(en).sort();
    const jaKeys = Object.keys(ja).sort();
    const zhKeys = Object.keys(zh).sort();
    expect(enKeys).toEqual(koKeys);
    expect(jaKeys).toEqual(koKeys);
    expect(zhKeys).toEqual(koKeys);
  });

  it("placeholder 토큰 ({xxx}) 일관성 — ko 와 다른 언어가 동일한 토큰 집합", () => {
    const TOKEN_RE = /\{(\w+)\}/g;
    const extractTokens = (v: string): Set<string> => {
      const out = new Set<string>();
      let m: RegExpExecArray | null;
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(v)) !== null) out.add(m[1]);
      return out;
    };
    const setEq = (a: Set<string>, b: Set<string>) => {
      if (a.size !== b.size) return false;
      for (const x of a) if (!b.has(x)) return false;
      return true;
    };

    const mismatches: string[] = [];
    for (const key of Object.keys(ko) as Array<keyof typeof ko>) {
      const koTokens = extractTokens(ko[key]);
      for (const [lang, dict] of [
        ["en", en],
        ["ja", ja],
        ["zh", zh],
      ] as const) {
        const otherTokens = extractTokens(dict[key]);
        if (!setEq(koTokens, otherTokens)) {
          mismatches.push(
            `[${String(key)}] ${lang}: ko=${[...koTokens]} vs ${lang}=${[...otherTokens]}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("t() translation function", () => {
  it("단순 키 lookup", () => {
    const koResult = t("uphero.camp.hero", "ko");
    const enResult = t("uphero.camp.hero", "en");
    expect(koResult).not.toBe(enResult);
    expect(koResult.length).toBeGreaterThan(0);
    expect(enResult.length).toBeGreaterThan(0);
  });

  it("placeholder 치환 ({param})", () => {
    const result = t("uphero.dungeon.floorReached", "en", { floor: 30 });
    expect(result).toContain("30");
    expect(result).not.toContain("{floor}");
  });

  it("언어 없을 때 ko fallback", () => {
    // Language 타입에 없는 값 테스트는 type 에러라 스킵.
    // 대신 기본값 ko 확인.
    const result = t("uphero.camp.hero");
    expect(result).toBe(t("uphero.camp.hero", "ko"));
  });

  it("모든 4 언어가 non-empty 결과 반환", () => {
    const key = "uphero.session.result.cta" as const;
    expect(t(key, "ko").length).toBeGreaterThan(0);
    expect(t(key, "en").length).toBeGreaterThan(0);
    expect(t(key, "ja").length).toBeGreaterThan(0);
    expect(t(key, "zh").length).toBeGreaterThan(0);
  });
});
