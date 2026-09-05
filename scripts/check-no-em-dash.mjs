// check-no-em-dash.mjs: 사용자에게 보이는 카피에 em-dash(U+2014) 가 남아 있는지 검사.
//
// 프로젝트 규칙: "사용자에게 보이는 카피와 문서에 em-dash 를 쓰지 않는다."
// 쉼표, 콜론, 가운뎃점(·), 괄호, 문장 분리로 대체한다.
//
// 검사 대상
//   1. src/i18n/{ko,en,ja,zh}.ts        모든 문자열 리터럴 (사전 값)
//   2. src/data/flavor/*.ts, src/data/cards.ts   모든 문자열 리터럴
//   3. upnext-ios/UpNext/UpNext/**/*.swift       주석 밖 문자열 리터럴
//      (DesignSystemGallery.swift 는 개발 전용 쇼케이스라 제외)
//   4. Localizable.xcstrings             키 자체에 em-dash 가 없는 항목의 모든 번역 값
//      (구 키는 지우지 않고 남겨두는 정책이라, 키에 em-dash 가 있으면 무시)
//
// 주석은 모두 제외한다 (코드 주석은 검사 범위 밖).
//
// 실행: node scripts/check-no-em-dash.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DASH = "—";

/**
 * TS/TSX 소스에서 문자열 리터럴을 추출한다. 주석(`//`, `/* *\/`) 은 건너뛰고,
 * 템플릿 리터럴의 `${...}` 안쪽은 코드로 취급한다.
 */
function tsStringLiterals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  let inLineComment = false;
  let inBlockComment = false;
  let quote = null;
  let start = 0;
  let startLine = 0;
  const interpDepth = [];
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        line += 1;
      }
    } else if (inBlockComment) {
      if (c === "*" && c2 === "/") {
        inBlockComment = false;
        i += 1;
      } else if (c === "\n") {
        line += 1;
      }
    } else if (quote) {
      if (c === "\\") {
        if (src[i + 1] === "\n") line += 1;
        i += 2;
        continue;
      }
      if (quote === "`" && c === "$" && c2 === "{") {
        out.push({ text: src.slice(start, i), line: startLine });
        interpDepth.push(true);
        quote = null;
        i += 2;
        continue;
      }
      if (c === quote) {
        out.push({ text: src.slice(start, i), line: startLine });
        quote = null;
      } else if (c === "\n") {
        line += 1;
      }
    } else {
      if (c === "/" && c2 === "/") {
        inLineComment = true;
        i += 1;
      } else if (c === "/" && c2 === "*") {
        inBlockComment = true;
        i += 1;
      } else if (c === '"' || c === "'" || c === "`") {
        quote = c;
        start = i + 1;
        startLine = line;
      } else if (c === "}" && interpDepth.length > 0) {
        interpDepth.pop();
        quote = "`";
        start = i + 1;
        startLine = line;
      }
      if (c === "\n") line += 1;
    }
    i += 1;
  }
  return out;
}

/**
 * Swift 소스에서 문자열 리터럴을 추출한다. 한 줄 주석, 중첩 블록 주석,
 * 멀티라인(`"""`), raw string(`#"..."#`) 을 처리한다.
 */
function swiftStringLiterals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  let blockDepth = 0;
  const countLines = (s) => {
    for (const ch of s) if (ch === "\n") line += 1;
  };
  while (i < n) {
    const c = src[i];
    if (blockDepth > 0) {
      if (c === "/" && src[i + 1] === "*") {
        blockDepth += 1;
        i += 2;
        continue;
      }
      if (c === "*" && src[i + 1] === "/") {
        blockDepth -= 1;
        i += 2;
        continue;
      }
      if (c === "\n") line += 1;
      i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      blockDepth = 1;
      i += 2;
      continue;
    }
    if (c === "#" || c === '"') {
      // raw string: 연속된 # 다음에 " 가 와야 한다
      let hashes = 0;
      let j = i;
      while (src[j] === "#") {
        hashes += 1;
        j += 1;
      }
      if (src[j] !== '"') {
        i += 1;
        continue;
      }
      const startLine = line;
      const closer = "#".repeat(hashes);
      const multiline = src.startsWith('"""', j);
      const openLen = multiline ? 3 : 1;
      let k = j + openLen;
      const bodyStart = k;
      const escape = "\\" + closer;
      const terminator = (multiline ? '"""' : '"') + closer;
      while (k < n) {
        if (src.startsWith(escape, k)) {
          k += escape.length + 1;
          continue;
        }
        if (src.startsWith(terminator, k)) break;
        if (!multiline && src[k] === "\n") break; // 미종결 리터럴 방어
        k += 1;
      }
      const text = src.slice(bodyStart, Math.min(k, n));
      out.push({ text, line: startLine });
      countLines(src.slice(i, Math.min(k + terminator.length, n)));
      i = Math.min(k + terminator.length, n);
      continue;
    }
    if (c === "\n") line += 1;
    i += 1;
  }
  return out;
}

function walkFiles(dir, ext, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, ext, acc);
    else if (name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

const failures = [];
function report(file, line, text) {
  const snippet = text.length > 160 ? text.slice(0, 160) + "…" : text;
  failures.push(`${file}:${line}  ${snippet.split("\n").join("\\n")}`);
}

// --- 1 + 2. 웹 사전 / flavor / cards ---
const tsTargets = [
  "src/i18n/ko.ts",
  "src/i18n/en.ts",
  "src/i18n/ja.ts",
  "src/i18n/zh.ts",
  "src/data/cards.ts",
  ...readdirSync("src/data/flavor")
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join("src/data/flavor", f)),
];
for (const file of tsTargets) {
  for (const lit of tsStringLiterals(readFileSync(file, "utf8"))) {
    if (lit.text.includes(DASH)) report(file, lit.line, lit.text);
  }
}

// --- 3. Swift ---
const SWIFT_ROOT = "upnext-ios/UpNext/UpNext";
const SWIFT_SKIP = new Set(["DesignSystemGallery.swift"]);
for (const file of walkFiles(SWIFT_ROOT, ".swift")) {
  if (SWIFT_SKIP.has(file.split("/").pop())) continue;
  for (const lit of swiftStringLiterals(readFileSync(file, "utf8"))) {
    if (lit.text.includes(DASH)) report(file, lit.line, lit.text);
  }
}

// --- 4. Localizable.xcstrings ---
const XC = `${SWIFT_ROOT}/Localizable.xcstrings`;
const xc = JSON.parse(readFileSync(XC, "utf8"));
for (const [key, entry] of Object.entries(xc.strings ?? {})) {
  if (key.includes(DASH)) continue; // 구 키는 남겨두는 정책이라 무시
  for (const [lang, loc] of Object.entries(entry.localizations ?? {})) {
    const value = loc?.stringUnit?.value;
    if (typeof value === "string" && value.includes(DASH)) {
      report(XC, 0, `[${key}][${lang}] ${value}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`em-dash(U+2014) 가 ${failures.length} 곳에 남아 있습니다:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("\n쉼표, 콜론, 가운뎃점(·), 괄호, 문장 분리로 바꿔주세요.");
  process.exit(1);
}
console.log("check:copy OK, 사용자 카피에 em-dash 없음");
