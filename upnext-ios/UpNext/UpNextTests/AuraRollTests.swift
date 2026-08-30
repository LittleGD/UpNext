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
}
