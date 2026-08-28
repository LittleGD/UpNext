#!/usr/bin/env python3
"""웹 src/data/quotePool.ts → iOS QuotePool.swift 재생성.

웹이 원본이다. 인용을 추가·수정하려면 quotePool.ts 를 고친 뒤 이 스크립트를 돌린다.

입력: /tmp/merged_quotes.json  (vitest 로 QUOTE_POOL 을 덤프한 것)
  npx vitest run <임시 덤프 테스트>  또는 아래 dump_pool() 사용

Swift 표현: 인용 하나 = [ko, en, ja, zh, authorKo, authorEn, authorJa, authorZh].
저자가 없는 앱 오리지널 문구는 뒤 4칸이 빈 문자열이다. 배열로 두는 이유는 기존
[[String]] 타입과 인덱스 0~3 접근을 그대로 유지해 호출부 변경을 최소화하기 위함이다.
"""
import json, sys

SRC = "/tmp/merged_quotes.json"
OUT = "/Users/jmlee/Documents/UpNext/upnext-ios/UpNext/UpNext/QuotePool.swift"
CATS = ["fitness","nutrition","mindfulness","learning","social","productivity","wellness","trending"]
LANGS = ("ko","en","ja","zh")

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

pool = json.load(open(SRC, encoding="utf-8"))
total = sum(len(pool[c]) for c in CATS)
authored = sum(1 for c in CATS for q in pool[c] if q.get("author"))

head = f'''//
//  QuotePool.swift
//  UpNext — 카드 디테일 + 오늘의 기운 인용문 풀 (웹 src/data/quotePool.ts 1:1 포팅).
//  8 카테고리 / 총 {total}개 / 4언어. 이 중 {authored}개는 실존 인물 인용으로 저자가 붙는다.
//
//  ※ 자동 생성 (scripts/gen-ios-quotepool.py). 수동 편집 금지 — 웹 원본 수정 후 재생성.
//
//  인용 하나의 표현: [ko, en, ja, zh, authorKo, authorEn, authorJa, authorZh]
//  앱 오리지널 문구는 뒤 4칸이 빈 문자열이다. text(_:lang:) / author(_:lang:) 로 읽는다.
//

import Foundation

enum QuotePool {{
    /// category rawValue → 인용 배열.
    static let pool: [String: [[String]]] = [
'''

body = []
for cat in CATS:
    body.append(f'        "{cat}": [')
    for q in pool[cat]:
        a = q.get("author")
        cells = [esc(q[l]) for l in LANGS] + [esc(a[l]) if a else "" for l in LANGS]
        body.append("            [" + ", ".join(f'"{c}"' for c in cells) + "],")
    body.append("        ],")

tail = '''    ]

    /// 인용 본문에서 현재 언어를 고른다.
    static func text(_ q: [String], lang: String) -> String {
        guard q.count >= 4 else { return "" }
        switch lang {
        case "en": return q[1]
        case "ja": return q[2]
        case "zh": return q[3]
        default:   return q[0]
        }
    }

    /// 저자명. 앱 오리지널 문구는 nil 을 돌려주므로 호출부에서 아무것도 그리지 않는다.
    static func author(_ q: [String], lang: String) -> String? {
        guard q.count >= 8 else { return nil }
        let name: String
        switch lang {
        case "en": name = q[5]
        case "ja": name = q[6]
        case "zh": name = q[7]
        default:   name = q[4]
        }
        return name.isEmpty ? nil : name
    }

    /// 카드 ID 를 해시하여 카테고리 풀에서 결정적으로 인용을 선택.
    /// 같은 카드를 열면 항상 같은 인용이 표시된다.
    private static func simpleHash(_ str: String) -> Int {
        var hash: Int32 = 0
        for ch in str.unicodeScalars {
            hash = (hash << 5) &- hash &+ Int32(truncatingIfNeeded: Int(ch.value))
        }
        return abs(Int(hash))
    }

    static func quote(for card: ChallengeCard, lang: String) -> String {
        let p = pool[card.category.rawValue] ?? []
        guard !p.isEmpty else { return "" }
        return text(p[simpleHash(card.id) % p.count], lang: lang)
    }
}
'''

open(OUT, "w", encoding="utf-8").write(head + "\n".join(body) + "\n" + tail)
print(f"생성 완료: {total}개 인용 (저자 {authored}개) → {OUT}")
