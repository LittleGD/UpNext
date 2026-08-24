#!/usr/bin/env python3
"""iOS i18n 회귀 스캐너 — 카탈로그에 없는 한국어 리터럴 검출.

기능 커밋이 raw 한국어를 재유입시키는 회귀(2026-06, 07, 08 세 차례 발생)를
릴리스 전에 잡는다. 두 가지를 검사한다:

  1. Swift 소스의 한국어 문자열 리터럴 중 Localizable.xcstrings 에 키가 없는 것.
     보간 `\\(...)` 은 SwiftUI 포맷키(%@/%lld 조합 전부)로 변환해 대조한다.
  2. 카탈로그 키 중 en/ja/zh-Hans 번역이 빠진 것 (완역 상태 유지 확인).

오탐 처리: 감사에서 "사용자 비노출/의도적 한국어"로 판정된 리터럴은
scripts/ios-i18n-baseline.json 에 기록돼 있고, 베이스라인에 없는 **신규**
리터럴만 실패로 보고한다. 신규 리터럴을 감사한 뒤 의도적 잔여로 확정했으면
`--update-baseline` 으로 베이스라인을 갱신한다.

한계: Text(String변수) 우회, String(localized:) locale 누락 같은 "카탈로그에
있는데 우회되는" 버그는 정적 문자열 스캔으로 못 잡는다. 그런 부류는 코드 리뷰
(렌더 경로 추적)로 잡아야 한다 — 패턴 목록은 메모리/감사 브리핑 참조.

사용:
  python3 scripts/ios-i18n-check.py                    # 검사 (신규 유입 시 exit 1)
  python3 scripts/ios-i18n-check.py --update-baseline  # 감사 후 베이스라인 갱신
"""

import json
import re
import sys
from itertools import product
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = REPO / "upnext-ios/UpNext/UpNext"
CATALOG = APP / "Localizable.xcstrings"
BASELINE = Path(__file__).resolve().parent / "ios-i18n-baseline.json"
LANGS = ["en", "ja", "zh-Hans"]

# 전문이 의도적 한국어인 파일 (감사 확정: 자체 4언어 구조/법률 전문/개발용 갤러리)
EXCLUDED_FILES = {"QuotePool.swift", "PrivacyView.swift", "DesignSystemGallery.swift"}
# 개발자 전용 메시지 (사용자 비노출)
DEV_ONLY_RE = re.compile(
    r"\b(precondition|preconditionFailure|fatalError|assert|assertionFailure|print|os_log)\s*\("
)

LIT_RE = re.compile(r'"((?:[^"\\]|\\.)*[가-힣](?:[^"\\]|\\.)*)"')


def swift_files():
    for p in sorted(APP.rglob("*.swift")):
        if "build" in p.parts:
            continue
        if p.name in EXCLUDED_FILES:
            continue
        yield p


def split_interpolations(s):
    """보간 리터럴을 [고정 텍스트, None(=보간), ...] 조각으로 분해.
    중첩 괄호를 균형 카운트로 처리 — 정규식 단독으로는 `\\(f(x))` 가 깨진다."""
    parts, buf, i = [], "", 0
    while i < len(s):
        if s.startswith("\\(", i):
            parts.append(buf)
            buf = ""
            depth, i = 1, i + 2
            while i < len(s) and depth:
                if s[i] == "(":
                    depth += 1
                elif s[i] == ")":
                    depth -= 1
                i += 1
            parts.append(None)
        else:
            buf += s[i]
            i += 1
    parts.append(buf)
    return parts


def format_key_candidates(s):
    """보간 리터럴이 매칭될 수 있는 카탈로그 포맷키 후보 전부 (%@/%lld 조합)."""
    parts = split_interpolations(s)
    holes = sum(1 for p in parts if p is None)
    if holes == 0:
        return [s]
    out = []
    for combo in product(["%@", "%lld"], repeat=holes):
        it = iter(combo)
        out.append("".join(next(it) if p is None else p for p in parts))
    return out


def unescape(s):
    return s.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")


def scan_missing_literals(catalog_keys):
    """카탈로그에 없는 한국어 리터럴 → {"file:literal": [lines]}"""
    found = {}
    for path in swift_files():
        rel = str(path.relative_to(REPO))
        for lineno, line in enumerate(path.read_text().split("\n"), 1):
            stripped = line.strip()
            if stripped.startswith("//"):
                continue
            if DEV_ONLY_RE.search(line):
                continue
            for m in LIT_RE.finditer(line):
                lit = unescape(m.group(1))
                if any(c in catalog_keys for c in format_key_candidates(lit)):
                    continue
                found.setdefault(f"{rel}\t{lit}", []).append(lineno)
    return found


def scan_catalog_gaps(catalog):
    gaps = []
    for key, entry in catalog["strings"].items():
        locs = entry.get("localizations", {})
        missing = [l for l in LANGS if l not in locs]
        if missing:
            gaps.append((key, missing))
    return gaps


def main():
    update = "--update-baseline" in sys.argv
    catalog = json.load(open(CATALOG))
    catalog_keys = set(catalog["strings"].keys())

    found = scan_missing_literals(catalog_keys)
    gaps = scan_catalog_gaps(catalog)

    if update:
        BASELINE.write_text(
            json.dumps(sorted(found.keys()), ensure_ascii=False, indent=1)
        )
        print(f"베이스라인 갱신: {len(found)}건 → {BASELINE.name}")
        return 0

    baseline = set(json.load(open(BASELINE))) if BASELINE.exists() else set()
    new = sorted(k for k in found if k not in baseline)
    stale = sorted(k for k in baseline if k not in found)

    ok = True
    if gaps:
        ok = False
        print(f"✗ 카탈로그 번역 누락 {len(gaps)}건:")
        for key, missing in gaps[:20]:
            print(f"    {key!r} — {', '.join(missing)} 없음")
    if new:
        ok = False
        print(f"✗ 카탈로그에 없는 신규 한국어 리터럴 {len(new)}건 (회귀 의심):")
        for k in new:
            rel, lit = k.split("\t", 1)
            lines = ",".join(map(str, found[k]))
            print(f"    {rel}:{lines}  {lit[:70]!r}")
        print(
            "  → 사용자 노출이면 카탈로그 키+번역 추가, 의도적 잔여로 감사 확정 시"
            " --update-baseline"
        )
    if ok:
        note = f" (의도적 잔여 {len(found)}건은 베이스라인으로 무시)" if found else ""
        print(f"✓ 신규 유입 없음, 카탈로그 {len(catalog_keys)}키 완역{note}")
        if stale:
            print(f"  참고: 베이스라인에만 있는 항목 {len(stale)}건 (정리하려면 --update-baseline)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
