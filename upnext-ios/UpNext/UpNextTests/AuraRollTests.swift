//
//  AuraRollTests.swift
//  UpNextTests — 등급 확률 롤(주사위)·실마리/흘려보낼 것 인덱스의 웹 패리티 검증.
//
//  웹 `src/lib/aura.test.ts` 의 픽스처 5벌을 그대로 하드코딩한다. 값이 어긋나면
//  웹/iOS 정수 연산이 갈라진 것이니 스펙(등급 확률 롤 의사코드)부터 다시 대조할 것.
//  해시 시드 구분자는 "|" 다(기존 sway/phrase 의 ":" 와 다름 — 의도된 스펙).
//

import XCTest
@testable import UpNext

final class AuraRollTests: XCTestCase {

    /// 웹 tierOf 와 같은 경계(80/60/38)를 테스트 쪽에서도 독립 구현해 회귀를 잡는다.
    private func tierOfScore(_ score: Int) -> AuraTier {
        score >= 80 ? .great : score >= 60 ? .good : score >= 38 ? .fair : .care
    }

    /// 2026-01-01 부터 n 일 연속 날짜 (웹 calendar(n) 과 동일).
    private func calendar(_ n: Int) -> [String] {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        var out: [String] = []
        var date = c.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        for _ in 0..<n {
            let p = c.dateComponents([.year, .month, .day], from: date)
            out.append(String(format: "%04d-%02d-%02d", p.year!, p.month!, p.day!))
            date = c.date(byAdding: .day, value: 1, to: date)!
        }
        return out
    }

    // MARK: - 패리티 픽스처 (웹과 같은 5벌)

    func testParityFixtures() {
        let fixtures: [(base: Int, today: String, salt: String, kind: AuraKind,
                        tier: AuraTier, score: Int)] = [
            (20, "2026-08-27", "device-1", .wealth, .fair, 47),
            (80, "2026-08-27", "device-1", .relationship, .good, 64),
            (50, "2026-09-01", "salt-A", .health, .great, 80),
            (0, "2026-12-31", "s4", .wealth, .care, 2),
            (100, "2027-01-01", "zz", .health, .great, 81),
        ]
        for f in fixtures {
            let r = Aura.rollTier(base: f.base, today: f.today, salt: f.salt, kind: f.kind)
            XCTAssertEqual(r.tier, f.tier,
                           "tier mismatch: base \(f.base) \(f.today) \(f.salt) \(f.kind)")
            XCTAssertEqual(r.score, f.score,
                           "score mismatch: base \(f.base) \(f.today) \(f.salt) \(f.kind)")
        }
    }

    // MARK: - 결정론 / 폴백

    func testDeterministicSameInputsSameResult() {
        for b in [0, 33, 67, 100] {
            let a = Aura.rollTier(base: b, today: "2026-08-27", salt: "device-1", kind: .wealth)
            let c = Aura.rollTier(base: b, today: "2026-08-27", salt: "device-1", kind: .wealth)
            XCTAssertEqual(a.tier, c.tier)
            XCTAssertEqual(a.score, c.score)
        }
    }

    func testSaltFallbackUsesBaseDirectly() {
        for b in [0, 10, 37, 38, 59, 60, 79, 80, 100] {
            let r = Aura.rollTier(base: b, today: "2026-08-27", salt: nil, kind: .wealth)
            XCTAssertEqual(r.score, b)
            XCTAssertEqual(r.tier, tierOfScore(b))
            let e = Aura.rollTier(base: b, today: "2026-08-27", salt: "", kind: .wealth)
            XCTAssertEqual(e.score, b, "빈 salt 도 없음과 같게 폴백해야 한다")
        }
    }

    // MARK: - 불변식

    func testScoreAlwaysInsideRolledTierBand() {
        for today in calendar(120) {
            for b in [0, 25, 50, 75, 100] {
                let r = Aura.rollTier(base: b, today: today, salt: "fixture-salt", kind: .health)
                XCTAssertGreaterThanOrEqual(r.score, 0)
                XCTAssertLessThanOrEqual(r.score, 100)
                XCTAssertEqual(tierOfScore(r.score), r.tier,
                               "tierOf(score) 는 뽑힌 tier 와 늘 일치해야 한다 (\(today), base \(b))")
            }
        }
    }

    func testAllFourTiersAppearOverAYear() {
        // 성실해도 가끔 흐린 날, 게을러도 가끔 맑은 날 — 그래야 점이다.
        for b in [10, 90] {
            var seen = Set<AuraTier>()
            for today in calendar(365) {
                seen.insert(Aura.rollTier(base: b, today: today,
                                          salt: "fixture-salt", kind: .wealth).tier)
            }
            XCTAssertEqual(seen, [.great, .good, .fair, .care], "base \(b)")
        }
    }

    func testProbabilityTiltsTowardBehavior() {
        func count(_ b: Int, _ tier: AuraTier) -> Int {
            calendar(365).filter {
                Aura.rollTier(base: b, today: $0, salt: "fixture-salt", kind: .wealth).tier == tier
            }.count
        }
        XCTAssertGreaterThan(count(90, .great), count(10, .great) * 2)
        XCTAssertGreaterThan(count(10, .care), count(90, .care))
    }

    func testKindsRollIndependently() {
        // 기운마다 주사위가 따로 구른다 (셋이 함께 움직이는 기계적 인상 방지).
        let differs = calendar(20).contains { today in
            let w = Aura.rollTier(base: 50, today: today, salt: "device-1", kind: .wealth).tier
            let r = Aura.rollTier(base: 50, today: today, salt: "device-1", kind: .relationship).tier
            let h = Aura.rollTier(base: 50, today: today, salt: "device-1", kind: .health).tier
            return w != r || r != h
        }
        XCTAssertTrue(differs)
    }

    // MARK: - 실마리·흘려보낼 것 선택 인덱스

    func testHintCautionIndexRangeAndDeterminism() {
        for today in calendar(30) {
            for kind in AuraKind.allCases {
                let h = Aura.hintIndex(today: today, salt: "device-1", kind: kind)
                let c = Aura.cautionIndex(today: today, salt: "device-1", kind: kind)
                for v in [h, c] {
                    XCTAssertGreaterThanOrEqual(v, 0)
                    XCTAssertLessThan(v, Aura.hintCount)
                }
                XCTAssertEqual(Aura.hintIndex(today: today, salt: "device-1", kind: kind), h)
                XCTAssertEqual(Aura.cautionIndex(today: today, salt: "device-1", kind: kind), c)
            }
        }
    }

    func testHintIndexRotatesAcrossDaysAndFallsBackWithoutSalt() {
        let hints = Set(calendar(14).map { Aura.hintIndex(today: $0, salt: "device-1", kind: .wealth) })
        XCTAssertGreaterThan(hints.count, 1)
        XCTAssertEqual(Aura.hintIndex(today: "2026-08-27", salt: nil, kind: .wealth), 0)
        XCTAssertEqual(Aura.cautionIndex(today: "2026-08-27", salt: nil, kind: .health), 0)
    }

    func testHintAndCautionMoveIndependently() {
        // 접두사("hint:"/"caution:")가 달라 따로 움직인다.
        let differs = calendar(14).contains {
            Aura.hintIndex(today: $0, salt: "device-1", kind: .wealth)
                != Aura.cautionIndex(today: $0, salt: "device-1", kind: .wealth)
        }
        XCTAssertTrue(differs)
    }

    // MARK: - 타로 제시 3장 (Aura.tarotOffer — 웹 auraTarotOffer 패리티)

    func testTarotOfferParityFixtures() {
        // 웹 aura.test.ts 와 공유하는 3벌. 값이 어긋나면 웹/iOS 정수 연산이 갈라진 것이니
        // 스펙(tarot0/1/2 접두사·while 재배치)부터 다시 대조할 것.
        XCTAssertEqual(Aura.tarotOffer(today: "2026-08-27", salt: "device-1", kind: .wealth),
                       [23, 14, 25])
        XCTAssertEqual(Aura.tarotOffer(today: "2026-09-01", salt: "salt-A", kind: .relationship),
                       [39, 18, 25])
        XCTAssertEqual(Aura.tarotOffer(today: "2027-01-01", salt: "zz", kind: .health),
                       [10, 31, 8])
    }

    func testTarotOfferDeterministicDistinctInRange() {
        for today in calendar(60) {
            for kind in AuraKind.allCases {
                let o = Aura.tarotOffer(today: today, salt: "device-1", kind: kind)
                XCTAssertEqual(Aura.tarotOffer(today: today, salt: "device-1", kind: kind), o)
                // 서로 다름 불변식 — while 은 방어선이고 자연 입력에서는 raw 충돌이
                // 사실상 안 나지만, 계약은 "항상 서로 다른 3장"이다.
                XCTAssertEqual(Set(o).count, 3, "\(today) \(kind)")
                for id in o {
                    XCTAssertGreaterThanOrEqual(id, 0)
                    XCTAssertLessThan(id, Aura.tarotCardCount)
                }
            }
        }
    }

    func testTarotOfferSaltFallback() {
        XCTAssertEqual(Aura.tarotOffer(today: "2026-08-27", salt: nil, kind: .wealth), [0, 1, 2])
        XCTAssertEqual(Aura.tarotOffer(today: "2026-08-27", salt: "", kind: .wealth), [0, 1, 2])
    }

    func testTarotOfferVariesByDayAndKind() {
        let byDay = Set(calendar(10).map {
            Aura.tarotOffer(today: $0, salt: "device-1", kind: .wealth)
                .map(String.init).joined(separator: ",")
        })
        XCTAssertGreaterThan(byDay.count, 1)
        let byKind = Set(AuraKind.allCases.map {
            Aura.tarotOffer(today: "2026-08-27", salt: "device-1", kind: $0)
                .map(String.init).joined(separator: ",")
        })
        XCTAssertEqual(byKind.count, 3)
    }

    func testTarotDeckMatchesCardCount() {
        // 웹 aura.test.ts 의 TAROT_DECK.length == TAROT_CARD_COUNT 회귀와 같은 계약 —
        // Aura.tarotCardCount 는 순환 의존을 피한 상수라 덱과의 일치를 여기서 잡는다.
        XCTAssertEqual(TarotPool.deck.count, Aura.tarotCardCount)
        for (i, card) in TarotPool.deck.enumerated() {
            XCTAssertEqual(card.id, i, "id 는 인덱스와 일치(0..39 불변 계약)")
        }
        // 관용 디코드 — 0..39 밖은 nil.
        XCTAssertNil(TarotPool.card(forId: -1))
        XCTAssertNil(TarotPool.card(forId: Aura.tarotCardCount))
        XCTAssertEqual(TarotPool.card(forId: 0)?.id, 0)
    }

    // MARK: - 조언 변주 (Aura.adviceVariant — 웹 auraAdviceVariant 패리티)

    func testAdviceVariantParityFixtures() {
        // 웹과 공유하는 3벌 — tarotOffer 픽스처와 같은 입력.
        XCTAssertEqual(Aura.adviceVariant(today: "2026-08-27", salt: "device-1", kind: .wealth), 0)
        XCTAssertEqual(Aura.adviceVariant(today: "2026-09-01", salt: "salt-A", kind: .relationship), 2)
        XCTAssertEqual(Aura.adviceVariant(today: "2027-01-01", salt: "zz", kind: .health), 5)
    }

    func testAdviceVariantRangeDeterminismAndFallback() {
        for today in calendar(30) {
            for kind in AuraKind.allCases {
                let v = Aura.adviceVariant(today: today, salt: "device-1", kind: kind)
                XCTAssertGreaterThanOrEqual(v, 0)
                XCTAssertLessThan(v, Aura.adviceVariants)
                XCTAssertEqual(Aura.adviceVariant(today: today, salt: "device-1", kind: kind), v)
            }
        }
        XCTAssertEqual(Aura.adviceVariant(today: "2026-08-27", salt: nil, kind: .wealth), 0)
        XCTAssertEqual(Aura.adviceVariant(today: "2026-08-27", salt: "", kind: .wealth), 0)
    }

    func testAdviceVariantCoversAllSix() {
        // 조짐 variant(0..2) 범위 밖의 값도 나온다 — 6종이 실제로 다 돈다(웹 120일 회귀).
        let seen = Set(calendar(120).map {
            Aura.adviceVariant(today: $0, salt: "device-1", kind: .wealth)
        })
        XCTAssertEqual(seen, Set(0..<Aura.adviceVariants))
    }

    // MARK: - 타로 선택 저장 (AuraStore.markTarot — 하루 고정·롤오버 소거·관용 디코드)

    private static let fortuneKey = "upnext_fortune"

    /// upnext_fortune 을 백업하고 빈 상태에서 body 를 돌린 뒤 원복 — 시뮬레이터의
    /// 실제 UserDefaults 를 건드리는 테스트라 흔적을 남기면 안 된다.
    private func withCleanFortuneDefaults(_ body: () -> Void) {
        let defaults = UserDefaults.standard
        let backup = defaults.data(forKey: Self.fortuneKey)
        defaults.removeObject(forKey: Self.fortuneKey)
        body()
        if let backup {
            defaults.set(backup, forKey: Self.fortuneKey)
        } else {
            defaults.removeObject(forKey: Self.fortuneKey)
        }
    }

    func testMarkTarotFixesFirstPickForTheDay() {
        withCleanFortuneDefaults {
            XCTAssertEqual(AuraStore.markTarot(today: "2026-08-27", kind: .wealth, cardId: 7), 7)
            // 재선택 불가 — 두 번째 탭이 와도 첫 선택이 이긴다(저장 계층의 계약).
            XCTAssertEqual(AuraStore.markTarot(today: "2026-08-27", kind: .wealth, cardId: 3), 7)
            XCTAssertEqual(AuraStore.state(today: "2026-08-27").tarot[.wealth], 7)
            // 기운별로 따로 고정된다.
            XCTAssertEqual(AuraStore.markTarot(today: "2026-08-27", kind: .health, cardId: 3), 3)
            XCTAssertEqual(AuraStore.state(today: "2026-08-27").tarot, [.wealth: 7, .health: 3])
            XCTAssertNil(AuraStore.state(today: "2026-08-27").tarot[.relationship])
        }
    }

    func testMarkTarotRolloverDiscardsYesterday() {
        withCleanFortuneDefaults {
            AuraStore.markTarot(today: "2026-08-27", kind: .wealth, cardId: 1)
            XCTAssertEqual(AuraStore.state(today: "2026-08-28").tarot, [:])
            // 다음 날 첫 기록이 어제 선택을 오늘 것으로 승격시키지 않는다.
            XCTAssertEqual(AuraStore.markTarot(today: "2026-08-28", kind: .health, cardId: 5), 5)
            XCTAssertEqual(AuraStore.state(today: "2026-08-28").tarot, [.health: 5])
        }
    }

    func testMarkTarotRejectsOutOfRangeWithoutWriting() {
        withCleanFortuneDefaults {
            // 범위 밖은 기록하지 않고 그대로 돌려준다(관용 디코드와 같은 계약의 방어선).
            XCTAssertEqual(AuraStore.markTarot(today: "2026-08-27", kind: .wealth,
                                               cardId: Aura.tarotCardCount), Aura.tarotCardCount)
            XCTAssertEqual(AuraStore.state(today: "2026-08-27").tarot, [:])
            XCTAssertEqual(AuraStore.markTarot(today: "2026-08-27", kind: .wealth, cardId: -1), -1)
            XCTAssertEqual(AuraStore.state(today: "2026-08-27").tarot, [:])
        }
    }

    func testTarotLenientDecodeDropsBadEntries() {
        withCleanFortuneDefaults {
            // 손댄 저장값 — 정수 0..39 만 인정하고 어긋난 항목은 그 기운만 버린다(웹 decodeTarot).
            let raw: [String: Any] = [
                "salt": "s", "auraDate": "2026-08-27",
                "auraTarot": ["wealth": 12, "relationship": 40, "health": "3"] as [String: Any],
            ]
            let data = try! JSONSerialization.data(withJSONObject: raw)
            UserDefaults.standard.set(data, forKey: Self.fortuneKey)
            XCTAssertEqual(AuraStore.state(today: "2026-08-27").tarot, [.wealth: 12])
        }
    }
}
