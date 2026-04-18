#!/usr/bin/env tsx
/**
 * Phase 13 review P1 — i18n placeholder 토큰 일관성 체커.
 *
 * TypeScript 의 `Record<DictKey, string>` 제약은 키의 완전성은 보장하지만,
 * 각 값에 있는 placeholder 토큰 (`{monster}`, `{damage}` 등) 일관성은 보장 안 함.
 * ko 값이 `"{monster} 에게 쓰러졌다"` 인데 en 값이 `"The hero died"` (토큰 없음) 면
 * runtime 에 placeholder 미대체로 `{monster}` 문자 그대로 노출됨.
 *
 * 이 스크립트:
 *   1. 각 dict 파일에서 모든 key-value 추출
 *   2. 각 값의 `{tokenName}` 토큰 set 추출
 *   3. ko 토큰 set 과 en/ja/zh 토큰 set 이 일치하는지 검증
 *   4. 불일치 시 non-zero exit (CI gate)
 *
 * 사용: `npx tsx scripts/check-i18n-placeholders.ts`
 */
import ko from "../src/i18n/ko";
import en from "../src/i18n/en";
import ja from "../src/i18n/ja";
import zh from "../src/i18n/zh";

const dicts = { ko, en, ja, zh } as const;
type Lang = keyof typeof dicts;

const TOKEN_RE = /\{(\w+)\}/g;

function extractTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  let m: RegExpExecArray | null;
  // reset state
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(value)) !== null) {
    tokens.add(m[1]);
  }
  return tokens;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function setToString(s: Set<string>): string {
  if (s.size === 0) return "(none)";
  return Array.from(s).sort().join(", ");
}

const mismatches: Array<{
  key: string;
  ko: Set<string>;
  lang: Lang;
  other: Set<string>;
}> = [];

const keys = Object.keys(ko) as Array<keyof typeof ko>;

for (const key of keys) {
  const koTokens = extractTokens(ko[key]);
  for (const lang of ["en", "ja", "zh"] as const) {
    const otherTokens = extractTokens(dicts[lang][key]);
    if (!setEquals(koTokens, otherTokens)) {
      mismatches.push({
        key: String(key),
        ko: koTokens,
        lang,
        other: otherTokens,
      });
    }
  }
}

if (mismatches.length === 0) {
  console.log(
    `✓ i18n placeholder 일관성 OK — 4 언어 × ${keys.length} 키 검증 통과`,
  );
  process.exit(0);
}

console.error(
  `✗ i18n placeholder 불일치 ${mismatches.length}건 발견:\n`,
);
for (const m of mismatches) {
  console.error(`  [${m.key}]`);
  console.error(`    ko: ${setToString(m.ko)}`);
  console.error(`    ${m.lang}: ${setToString(m.other)}`);
}
process.exit(1);
