#!/usr/bin/env python3
"""웹 src/data/tarotPool.ts → iOS TarotPool.swift 재생성 (gen-ios-quotepool.py 선례).

웹이 원본이다. 카드를 수정하려면 tarotPool.ts 를 고친 뒤 이 스크립트를 돌린다.
id 0..39 는 불변 — 저장(upnext_fortune.auraTarot)과 웹/iOS 패리티가 이 번호에 묶인다.

tarotPool.ts 의 규칙적인 객체 리터럴 모양(name/icon/readings 필드 순서, 한 줄
L10nText)을 그대로 파싱하므로, TS 쪽 모양을 바꾸면 여기 정규식도 같이 손봐야 한다.

Swift 표현: 이름 = [ko, en, ja, zh], readings = [great, good, fair, care] 순서의
[[String]] (각 원소 [ko, en, ja, zh]). QuotePool 의 배열 인덱스 관례를 따른다.
출력은 결정적 — 재실행하면 바이트 동일해야 한다.
"""
import re, sys

SRC = "/Users/jmlee/Documents/UpNext/src/data/tarotPool.ts"
OUT = "/Users/jmlee/Documents/UpNext/upnext-ios/UpNext/UpNext/TarotPool.swift"
TIERS = ("great", "good", "fair", "care")
LANGS = ("ko", "en", "ja", "zh")

STR = r'"((?:[^"\\]|\\.)*)"'
L10N = r'\{ ko: %s, en: %s, ja: %s, zh: %s \}' % (STR, STR, STR, STR)
CARD = re.compile(
    r'\{\s*id: (\d+),\s*name: %s,\s*icon: %s,\s*readings: \{\s*'
    r'great: %s,\s*good: %s,\s*fair: %s,\s*care: %s,\s*\},\s*\},'
    % (L10N, STR, L10N, L10N, L10N, L10N))


def unesc_ts(s: str) -> str:
    return s.replace('\\"', '"').replace("\\\\", "\\")


def esc_swift(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


src = open(SRC, encoding="utf-8").read()
cards = CARD.findall(src)
if len(cards) != 40:
    sys.exit(f"오류: 카드 {len(cards)}장 파싱됨 (40장이어야 함) — TS 모양이 바뀌었나?")

parsed = []
for c in cards:
    cid = int(c[0])
    name = [unesc_ts(x) for x in c[1:5]]
    icon = unesc_ts(c[5])
    readings = [[unesc_ts(x) for x in c[6 + t * 4 : 10 + t * 4]] for t in range(4)]
    for group in [name, [icon]] + readings:
        if any(not s.strip() for s in group):
            sys.exit(f"오류: 카드 {cid} 에 빈 문자열이 있다 — 병합이 덜 됐나?")
    parsed.append((cid, name, icon, readings))

if [p[0] for p in parsed] != list(range(40)):
    sys.exit("오류: id 가 0..39 순서가 아니다")

head = '''//
//  TarotPool.swift
//  UpNext — 타로 덱 40장 (웹 src/data/tarotPool.ts 1:1 포팅).
//  40장 × (이름 + 해설 4등급) × 4언어. id 0..39 불변 — 저장·웹 패리티가 이 번호에 묶인다.
//
//  ※ 자동 생성 (scripts/gen-ios-tarotpool.py). 수동 편집 금지 — 웹 원본 수정 후 재생성.
//
//  이름 = [ko, en, ja, zh]. readings = [great, good, fair, care] 순서,
//  각 원소 [ko, en, ja, zh]. name(_:lang:) / reading(_:tier:lang:) 으로 읽는다.
//

import Foundation

/// 타로 카드 한 장. icon 은 양 플랫폼 공존 PixelIcon 이름.
struct TarotCard: Hashable {
    /// 0..39 불변 — upnext_fortune.auraTarot 저장이 이 번호를 가리킨다
    let id: Int
    /// 이름 [ko, en, ja, zh]
    let name: [String]
    /// PixelIcon 이름
    let icon: String
    /// 등급별 해설 [great, good, fair, care], 각 원소 [ko, en, ja, zh]
    let readings: [[String]]
}

enum TarotPool {
    /// 덱 전체. 인덱스 == id.
    static let deck: [TarotCard] = [
'''

body = []
for cid, name, icon, readings in parsed:
    name_s = ", ".join(f'"{esc_swift(x)}"' for x in name)
    body.append(f"        TarotCard(id: {cid}, name: [{name_s}], icon: \"{esc_swift(icon)}\", readings: [")
    for t in range(4):
        row = ", ".join(f'"{esc_swift(x)}"' for x in readings[t])
        body.append(f"            [{row}],")
    body.append("        ]),")

tail = '''    ]

    private static func langIndex(_ lang: String) -> Int {
        switch lang {
        case "en": return 1
        case "ja": return 2
        case "zh": return 3
        default:   return 0
        }
    }

    private static func tierIndex(_ tier: AuraTier) -> Int {
        switch tier {
        case .great: return 0
        case .good:  return 1
        case .fair:  return 2
        case .care:  return 3
        }
    }

    /// 카드 이름(현재 언어).
    static func name(_ card: TarotCard, lang: String) -> String {
        guard card.name.count >= 4 else { return "" }
        return card.name[langIndex(lang)]
    }

    /// 그날 그 기운의 등급에 맞는 해설(현재 언어). 화면은 이 한 곳만 읽는다.
    static func reading(_ card: TarotCard, tier: AuraTier, lang: String) -> String {
        let t = tierIndex(tier)
        guard card.readings.count > t, card.readings[t].count >= 4 else { return "" }
        return card.readings[t][langIndex(lang)]
    }

    /// 저장된 cardId 를 관용적으로 해석 — 0..39 정수만 인정.
    static func card(forId id: Int) -> TarotCard? {
        guard deck.indices.contains(id) else { return nil }
        return deck[id]
    }
}
'''

open(OUT, "w", encoding="utf-8", newline="\n").write(head + "\n".join(body) + "\n" + tail)
print(f"생성 완료: 40장 × 4등급 × 4언어 → {OUT}")
