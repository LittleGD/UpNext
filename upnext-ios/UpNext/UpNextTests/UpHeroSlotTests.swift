//
//  UpHeroSlotTests.swift
//  UpNextTests — 굴림틀(rune drum) 확률 테이블 동치성 (UpHeroSlot.swift).
//
//  아래 픽스처는 **웹 정본에서 실측 생성**했다: `src/lib/upHeroSlot.ts` 의
//  rollSlotOutcome / renderSymbols / 회계 함수를 웹 mulberry32 (`createRng`) 로
//  구동해 vitest 로 뽑은 출력이다 (롤 2026-08-31, near-miss 표시 2026-09-01).
//  Swift 가 같은 seed 에서 같은 수열을 내면 두 플랫폼의 확률·그림이 부동소수 연산까지
//  일치한다는 뜻이다.
//
//  픽스처를 손으로 고치지 말 것. 확률 테이블을 바꿨다면 웹에서 다시 뽑아 올린다.
//

import XCTest
@testable import UpNext

/// 지정한 값만 내놓는 난수 스텁 — 가중치 구간 경계를 정확히 겨눈다.
private struct FixedRandom: RandomSource {
    var values: [Double]
    var idx = 0
    mutating func unit() -> Double {
        defer { idx += 1 }
        return values[min(idx, values.count - 1)]
    }
}

final class UpHeroSlotTests: XCTestCase {

    // MARK: - 픽스처 (웹 실측)

    /// seed → blankStreak 0 으로 40회 연속 굴린 결과 id 수열.
    private static let webRolls: [Int: [String]] = [
        1: ["coinSmall", "blank", "coinSmall", "itemBox", "itemBox", "blank", "coinSmall", "coinMid", "blank", "battleBuff", "blank", "blank", "blank", "blank", "blank", "blank", "blank", "blank", "blank", "coinMid", "blank", "blank", "blank", "blank", "coinSmall", "coinJackpot", "blank", "blank", "coinSmall", "coinSmall", "coinMid", "blank", "coinMid", "blank", "coinMid", "battleBuff", "blank", "coinMid", "blank", "blank"],
        42: ["coinSmall", "blank", "rankProtect", "coinSmall", "blank", "coinSmall", "blank", "coinSmall", "rankProtect", "blank", "blank", "rankProtect", "coinMid", "blank", "blank", "coinSmall", "coinMid", "coinSmall", "blank", "blank", "rankProtect", "blank", "coinSmall", "blank", "blank", "blank", "blank", "coinMid", "coinSmall", "blank", "blank", "rankProtect", "blank", "coinJackpot", "blank", "blank", "blank", "blank", "coinSmall", "coinSmall"],
        1337: ["blank", "blank", "coinJackpot", "coinSmall", "blank", "blank", "coinSmall", "coinSmall", "coinSmall", "coinSmall", "coinSmall", "blank", "blank", "blank", "blank", "coinJackpot", "coinSmall", "destroyProtect", "coinSmall", "blank", "blank", "blank", "blank", "blank", "blank", "coinMid", "coinMid", "blank", "blank", "coinSmall", "blank", "coinMid", "blank", "coinJackpot", "blank", "coinSmall", "blank", "blank", "blank", "blank"],
        987654321: ["destroyProtect", "blank", "blank", "rankProtect", "coinSmall", "blank", "blank", "blank", "blank", "coinSmall", "itemBox", "coinMid", "itemBox", "blank", "blank", "blank", "rankProtect", "itemBox", "blank", "blank", "blank", "blank", "itemBox", "coinMid", "blank", "rankProtect", "blank", "blank", "blank", "blank", "blank", "blank", "coinSmall", "blank", "coinSmall", "blank", "blank", "blank", "rankProtect", "blank"],
    ]

    /// seed → blankStreak 4 (pity 발동) 으로 20회 굴린 결과 id 수열.
    private static let webPityRolls: [Int: [String]] = [
        1: ["coinJackpot", "coinSmall", "coinMid", "itemBox", "itemBox", "coinSmall", "coinJackpot", "rankProtect", "coinMid", "battleBuff", "coinMid", "coinMid", "coinSmall", "coinMid", "coinSmall", "coinSmall", "coinMid", "coinSmall", "coinMid", "rankProtect"],
        42: ["coinJackpot", "coinMid", "destroyProtect", "rankProtect", "coinSmall", "coinMid", "coinSmall", "coinJackpot", "destroyProtect", "coinMid", "coinSmall", "destroyProtect", "rankProtect", "coinSmall", "coinSmall", "coinMid", "rankProtect", "coinJackpot", "coinSmall", "coinMid"],
        1337: ["coinSmall", "coinSmall", "rankProtect", "rankProtect", "coinMid", "coinMid", "coinMid", "coinMid", "coinMid", "coinMid", "rankProtect", "coinSmall", "coinMid", "coinMid", "coinSmall", "rankProtect", "coinMid", "itemBox", "coinJackpot", "coinSmall"],
        987654321: ["itemBox", "coinSmall", "coinSmall", "destroyProtect", "coinJackpot", "coinSmall", "coinMid", "coinMid", "coinSmall", "coinMid", "itemBox", "rankProtect", "itemBox", "coinSmall", "coinSmall", "coinSmall", "destroyProtect", "itemBox", "coinSmall", "coinMid"],
    ]

    /// seed → 꽝 화면 12회 연속 렌더 (웹 `renderSymbols("blank")`, near-miss 30% 포함).
    /// 난수 소비 순서 [nearMiss 판정] → [match 가중] → [miss 균등] → [variant] / 비-near-miss
    /// 는 Fisher-Yates 3칸 — 한 칸이라도 다르면 여기서 즉시 갈린다.
    private static let webBlankRenders: [Int: [([SlotSymbol], Bool)]] = [
        1: [([.coin, .cloth, .star], false), ([.coins, .cloth, .chest], false), ([.star, .shield, .cloth], false), ([.gem, .gem, .coins], true), ([.coin, .shield, .chest], false), ([.gem, .gem, .coin], true), ([.chest, .gem, .shield], false), ([.shield, .chest, .gem], false), ([.shield, .chest, .star], false), ([.cloth, .cloth, .coin], true), ([.coins, .coin, .chest], false), ([.coin, .gem, .coins], false)],
        42: [([.shield, .star, .chest], false), ([.shield, .shield, .coins], true), ([.shield, .gem, .star], false), ([.gem, .coin, .cloth], false), ([.cloth, .coins, .coin], false), ([.coin, .cloth, .gem], false), ([.coin, .coin, .gem], true), ([.coin, .gem, .star], false), ([.chest, .gem, .cloth], false), ([.coin, .coin, .cloth], true), ([.cloth, .cloth, .coins], true), ([.star, .cloth, .shield], false)],
        1337: [([.gem, .gem, .chest], true), ([.gem, .cloth, .coins], false), ([.shield, .cloth, .gem], false), ([.gem, .coin, .chest], false), ([.star, .cloth, .gem], false), ([.gem, .gem, .shield], true), ([.chest, .coin, .gem], false), ([.cloth, .cloth, .coins], true), ([.cloth, .cloth, .coin], true), ([.gem, .coin, .coins], false), ([.gem, .gem, .coins], true), ([.cloth, .cloth, .gem], true)],
        987654321: [([.coin, .coins, .star], false), ([.gem, .shield, .coins], false), ([.cloth, .cloth, .star], true), ([.gem, .coins, .coin], false), ([.star, .gem, .cloth], false), ([.coins, .coins, .star], true), ([.chest, .shield, .cloth], false), ([.gem, .coins, .shield], false), ([.coin, .cloth, .shield], false), ([.coins, .coins, .star], true), ([.gem, .gem, .chest], true), ([.gem, .cloth, .coins], false)],
    ]

    /// 웹 seed 777 로 롤 → 렌더를 번갈아 30회 (같은 난수열을 두 함수가 나눠 쓴다).
    /// 롤과 렌더의 난수 소비 개수가 한 번이라도 어긋나면 이후 수열이 전부 밀린다.
    private static let webInterleaved777: [(SlotOutcomeId, [SlotSymbol], Bool)] = [
        (.coinMid, [.coins, .coins, .coins], false),
        (.blank, [.coins, .coins, .cloth], true),
        (.blank, [.cloth, .chest, .coins], false),
        (.rankProtect, [.shield, .shield, .shield], false),
        (.blank, [.shield, .star, .cloth], false),
        (.blank, [.chest, .star, .gem], false),
        (.blank, [.cloth, .cloth, .shield], true),
        (.coinMid, [.coins, .coins, .coins], false),
        (.blank, [.coin, .gem, .chest], false),
        (.blank, [.coin, .coin, .cloth], true),
        (.coinSmall, [.coin, .coin, .coin], false),
        (.blank, [.star, .cloth, .gem], false),
        (.coinMid, [.coins, .coins, .coins], false),
        (.itemBox, [.chest, .chest, .chest], false),
        (.rankProtect, [.shield, .shield, .shield], false),
        (.destroyProtect, [.cloth, .cloth, .cloth], false),
        (.blank, [.cloth, .gem, .star], false),
        (.blank, [.chest, .gem, .shield], false),
        (.blank, [.shield, .star, .coin], false),
        (.coinSmall, [.coin, .coin, .coin], false),
        (.blank, [.gem, .gem, .cloth], true),
        (.blank, [.chest, .coin, .star], false),
        (.coinMid, [.coins, .coins, .coins], false),
        (.coinSmall, [.coin, .coin, .coin], false),
        (.coinMid, [.coins, .coins, .coins], false),
        (.coinMid, [.coins, .coins, .coins], false),
        (.coinJackpot, [.gem, .gem, .gem], false),
        (.coinSmall, [.coin, .coin, .coin], false),
        (.blank, [.cloth, .cloth, .shield], true),
        (.blank, [.chest, .coins, .coin], false),
    ]

    /// 웹 seed 20260831 로 꽝 20,000회 렌더 — near-miss 건수 / 배치 A 건수 / 맞은 룬 도수.
    /// 30% · 80% · 가중치(gem 3, cloth 3, 나머지 1) 가 한 자리라도 다르면 여기서 벌어진다.
    private static let webNearMissDist20000 = (near: 5926, variantA: 4726)
    private static let webNearMissMatchHist20000: [SlotSymbol: Int] = [
        .gem: 1649, .shield: 568, .coins: 482, .star: 563, .cloth: 1594, .coin: 523, .chest: 547,
    ]

    /// 웹 seed 20260831 로 20,000회 굴린 결과별 도수. 단발 수열보다 강한 증거다 —
    /// 가중치 하나만 어긋나도 여기서 수십~수백 단위로 벌어진다.
    private static let webDist20000: [String: Int] = [
        "blank": 9823, "coinSmall": 3931, "coinMid": 2373, "coinJackpot": 333,
        "rankProtect": 1987, "destroyProtect": 753, "itemBox": 634, "battleBuff": 166,
    ]

    // MARK: - 테이블 계약

    func testWeightsSumToContract() {
        let total = UpHeroSlot.outcomes.reduce(0) { $0 + $1.weight }
        XCTAssertEqual(total, UpHeroSlot.weightTotal,
                       "가중치 합계가 1000 이 아니면 웹과 확률이 갈린다")
    }

    func testEveryOutcomeHasExactlyOneRowAndOneGrant() {
        XCTAssertEqual(UpHeroSlot.outcomes.count, SlotOutcomeId.allCases.count)
        for id in SlotOutcomeId.allCases {
            XCTAssertEqual(UpHeroSlot.outcomes.filter { $0.id == id }.count, 1,
                           "\(id.rawValue) 행이 중복이거나 없다")
            XCTAssertNotNil(UpHeroSlot.grants[id], "\(id.rawValue) 지급 정의 누락")
        }
    }

    /// 결과별 룬은 서로 달라야 한다 — 같은 룬이 두 결과에 붙으면 화면만 보고
    /// 무엇을 받았는지 구분할 수 없다.
    func testWinSymbolsAreDistinct() {
        let winSymbols = UpHeroSlot.outcomes.filter { $0.id != .blank }.map(\.symbol)
        XCTAssertEqual(Set(winSymbols).count, winSymbols.count)
    }

    func testGrantsMatchWebTable() {
        XCTAssertEqual(UpHeroSlot.grant(.blank), .none)
        XCTAssertEqual(UpHeroSlot.grant(.coinSmall), .coins(amount: 100))
        XCTAssertEqual(UpHeroSlot.grant(.coinMid), .coins(amount: 250))
        XCTAssertEqual(UpHeroSlot.grant(.coinJackpot), .coins(amount: 700))
        XCTAssertEqual(UpHeroSlot.grant(.rankProtect), .downGuards(count: 1))
        XCTAssertEqual(UpHeroSlot.grant(.destroyProtect), .destroyGuards(count: 1))
        XCTAssertEqual(UpHeroSlot.grant(.itemBox), .itemBox(floorBonus: 10))
        XCTAssertEqual(UpHeroSlot.grant(.battleBuff), .combatBuff(pct: 10, battles: 3))
    }

    func testCostsAndCapsMatchWeb() {
        XCTAssertEqual(UpHeroSlot.spinCost, 100)
        XCTAssertEqual(UpHeroSlot.dailySpinCap, 3)
        XCTAssertEqual(UpHeroSlot.pityThreshold, 5)
        XCTAssertEqual(UpHeroSlot.destroyGuardShadowValue, 300)
        XCTAssertEqual(UpHeroSlot.downGuardValue, 150)
    }

    // MARK: - 회계 (웹 실측값과 정확히 일치)

    func testAccountingMatchesWeb() {
        XCTAssertEqual(UpHeroSlot.expectedValue(), 92.75, accuracy: 1e-12)
        XCTAssertEqual(UpHeroSlot.rtp(), 0.9275, accuracy: 1e-12)
        XCTAssertEqual(UpHeroSlot.winRate(), 0.51, accuracy: 1e-12)
    }

    func testOddsMatchWeb() {
        let expected: [SlotOutcomeId: Double] = [
            .blank: 0.49, .coinSmall: 0.194, .coinMid: 0.112, .coinJackpot: 0.017,
            .rankProtect: 0.105, .destroyProtect: 0.039, .itemBox: 0.034,
            .battleBuff: 0.009,
        ]
        let actual = UpHeroSlot.odds()
        XCTAssertEqual(actual.count, expected.count)
        for (id, p) in expected {
            XCTAssertEqual(actual[id] ?? -1, p, accuracy: 1e-12, "\(id.rawValue) 확률 불일치")
        }
        // 확률 합계는 정확히 1 — 공개 화면이 "합이 99.9%" 를 보여주면 안 된다.
        XCTAssertEqual(actual.values.reduce(0, +), 1.0, accuracy: 1e-12)
    }

    func testItemBoxFloorBonus() {
        XCTAssertEqual(UpHeroSlot.itemBoxFloor(currentFloor: 7), 17)
        XCTAssertEqual(UpHeroSlot.itemBoxFloor(currentFloor: 0), 10)
    }

    // MARK: - 롤 동치성

    func testRollSequencesMatchWebPerSeed() {
        for (seed, expected) in Self.webRolls {
            var rng = Mulberry32(seed: seed)
            let actual = (0..<expected.count).map { _ in
                UpHeroSlot.rollOutcome(blankStreak: 0, rng: &rng).rawValue
            }
            XCTAssertEqual(actual, expected, "seed \(seed) 롤 수열이 웹과 다르다")
        }
    }

    func testPityRollSequencesMatchWeb() {
        for (seed, expected) in Self.webPityRolls {
            var rng = Mulberry32(seed: seed)
            let actual = (0..<expected.count).map { _ in
                UpHeroSlot.rollOutcome(blankStreak: 4, rng: &rng).rawValue
            }
            XCTAssertEqual(actual, expected, "seed \(seed) pity 수열이 웹과 다르다")
            XCTAssertFalse(actual.contains("blank"),
                           "pity 발동 시 꽝이 나오면 안 된다")
        }
    }

    /// pity 는 임계값 **직전** 부터 걸린다 (streak >= threshold-1). 경계에서
    /// 한 칸 밀리면 유저 체감이 완전히 달라지므로 양쪽을 다 고정한다.
    func testPityBoundary() {
        // streak 3 (= threshold-2) 은 아직 평범한 표 → 충분히 굴리면 꽝이 나온다.
        var below = Mulberry32(seed: 1)
        let belowRolls = (0..<200).map { _ in
            UpHeroSlot.rollOutcome(blankStreak: UpHeroSlot.pityThreshold - 2, rng: &below)
        }
        XCTAssertTrue(belowRolls.contains(.blank))

        // streak 4 (= threshold-1) 부터는 꽝이 구조적으로 불가능하다.
        var at = Mulberry32(seed: 1)
        for _ in 0..<200 {
            XCTAssertNotEqual(
                UpHeroSlot.rollOutcome(blankStreak: UpHeroSlot.pityThreshold - 1, rng: &at),
                .blank)
        }
    }

    /// 각 결과의 가중치 구간 **한가운데** 를 겨눠 그 결과가 나오는지 확인한다.
    /// 누적 훑기가 한 칸 밀리면 여기서 즉시 드러난다 (웹 upHeroSlot.test.ts 와 같은 축).
    func testWeightBandsMapToExpectedOutcome() {
        var lower = 0
        for o in UpHeroSlot.outcomes {
            // 구간 [lower, lower+weight) 의 중앙을 [0,1) 로 환산.
            let r = (Double(lower) + Double(o.weight) / 2) / Double(UpHeroSlot.weightTotal)
            var rng = FixedRandom(values: [r])
            XCTAssertEqual(UpHeroSlot.rollOutcome(blankStreak: 0, rng: &rng), o.id,
                           "\(o.id.rawValue) 구간이 어긋났다")
            lower += o.weight
        }
        XCTAssertEqual(lower, UpHeroSlot.weightTotal)
    }

    /// 난수 상한(1 에 가장 가까운 값)은 표의 **마지막** 결과여야 한다.
    /// 웹 `rollSlotOutcome(0, () => 0.999999999) === "battleBuff"` 와 같은 계약.
    func testTopOfRangeYieldsLastOutcome() {
        var rng = FixedRandom(values: [0.999999999])
        XCTAssertEqual(UpHeroSlot.rollOutcome(blankStreak: 0, rng: &rng), .battleBuff)
        // 하한은 첫 결과.
        var low = FixedRandom(values: [0])
        XCTAssertEqual(UpHeroSlot.rollOutcome(blankStreak: 0, rng: &low), .blank)
    }

    /// 소모품 결과의 회계 기준가가 "몇 장 × 장당 가치" 와 맞는가 —
    /// 지급 수량을 바꾸고 value 를 안 고치면 RTP 가 조용히 어긋난다.
    func testConsumableValuesMatchGrantCounts() {
        if case let .destroyGuards(count) = UpHeroSlot.grant(.destroyProtect) {
            XCTAssertEqual(count * UpHeroSlot.destroyGuardShadowValue,
                           UpHeroSlot.def(.destroyProtect).value)
        } else { XCTFail("destroyProtect 지급 종류가 바뀌었다") }

        if case let .downGuards(count) = UpHeroSlot.grant(.rankProtect) {
            XCTAssertEqual(count * UpHeroSlot.downGuardValue,
                           UpHeroSlot.def(.rankProtect).value)
        } else { XCTFail("rankProtect 지급 종류가 바뀌었다") }
    }

    /// 기대 회수액은 비용보다 **작아야** 한다 — 무한 코인 펌프가 되면 경제가 무너진다.
    func testHouseEdgeExists() {
        XCTAssertLessThan(UpHeroSlot.expectedValue(), Double(UpHeroSlot.spinCost))
    }

    func testLargeDistributionMatchesWebExactly() {
        var rng = Mulberry32(seed: 20260831)
        var counts: [String: Int] = [:]
        for _ in 0..<20000 {
            let id = UpHeroSlot.rollOutcome(blankStreak: 0, rng: &rng)
            counts[id.rawValue, default: 0] += 1
        }
        XCTAssertEqual(counts, Self.webDist20000,
                       "20,000회 도수가 웹과 한 건이라도 다르면 확률이 갈린 것이다")
    }

    // MARK: - 표시 동치성 (near-miss 는 표시 전용)

    func testRenderSymbolsForWinsAreTriples() {
        for def in UpHeroSlot.outcomes where def.id != .blank {
            var rng = Mulberry32(seed: 7)
            for _ in 0..<200 {
                let r = UpHeroSlot.render(def.id, rng: &rng)
                XCTAssertEqual(r.symbols, [def.symbol, def.symbol, def.symbol],
                               "\(def.id.rawValue) 는 같은 룬 3개여야 한다")
                XCTAssertFalse(r.nearMiss, "보상은 near-miss 가 아니다")
            }
        }
    }

    func testBlankRenderSequencesMatchWeb() {
        for (seed, expected) in Self.webBlankRenders {
            var rng = Mulberry32(seed: seed)
            let actual = (0..<expected.count).map { _ -> ([SlotSymbol], Bool) in
                let r = UpHeroSlot.render(.blank, rng: &rng)
                return (r.symbols, r.nearMiss)
            }
            for (i, (a, e)) in zip(actual, expected).enumerated() {
                XCTAssertEqual(a.0, e.0, "seed \(seed) #\(i) 꽝 룬이 웹과 다르다")
                XCTAssertEqual(a.1, e.1, "seed \(seed) #\(i) near-miss 플래그가 웹과 다르다")
            }
        }
    }

    /// 튜플 편의형(세션 배선이 쓰는 시그니처)은 `render` 와 같은 난수를 같은 순서로 쓴다.
    func testRenderSymbolsTupleMatchesRender() {
        var a = Mulberry32(seed: 42)
        var b = Mulberry32(seed: 42)
        for _ in 0..<300 {
            let r = UpHeroSlot.render(.blank, rng: &a)
            let (x, y, z) = UpHeroSlot.renderSymbols(.blank, rng: &b)
            XCTAssertEqual(r.symbols, [x, y, z])
            XCTAssertEqual(UpHeroSlot.isNearMiss([x, y, z]), r.nearMiss)
        }
    }

    /// 롤과 렌더가 한 난수열을 나눠 쓰는 실제 배선 순서 — 웹 seed 777 수열과 일치.
    func testInterleavedRollAndRenderMatchWeb() {
        var rng = Mulberry32(seed: 777)
        for (i, e) in Self.webInterleaved777.enumerated() {
            let o = UpHeroSlot.rollOutcome(blankStreak: 0, rng: &rng)
            let r = UpHeroSlot.render(o, rng: &rng)
            XCTAssertEqual(o, e.0, "#\(i) 롤이 웹과 다르다")
            XCTAssertEqual(r.symbols, e.1, "#\(i) 룬이 웹과 다르다")
            XCTAssertEqual(r.nearMiss, e.2, "#\(i) near-miss 가 웹과 다르다")
        }
    }

    /// **설계 계약**: 꽝 화면은 3개가 모두 같아질 수 없다 (그건 당첨 그림). near-miss 는
    /// 두 개 동일 + 하나 다름, 나머지는 셋 다 다름. `blank` 룬 자체는 그리지 않는다.
    /// 20,000회 도수는 웹과 한 건도 다르지 않아야 한다 (30% / 80% / 가중치 계약).
    func testBlankRenderContractAndDistributionMatchWeb() {
        var rng = Mulberry32(seed: 20260831)
        var near = 0
        var variantA = 0
        var hist: [SlotSymbol: Int] = [:]
        for _ in 0..<20000 {
            let r = UpHeroSlot.render(.blank, rng: &rng)
            XCTAssertEqual(r.symbols.count, 3)
            XCTAssertFalse(r.symbols.contains(.blank))
            XCTAssertNotEqual(Set(r.symbols).count, 1, "꽝인데 셋이 다 같다")
            XCTAssertEqual(UpHeroSlot.isNearMiss(r.symbols), r.nearMiss,
                           "플래그와 그림이 어긋났다 — UI 는 symbols 만 보고 되짚는다")
            if r.nearMiss {
                near += 1
                XCTAssertEqual(Set(r.symbols).count, 2)
                if r.symbols[0] == r.symbols[1] { variantA += 1 }
                hist[r.symbols[0], default: 0] += 1
            } else {
                XCTAssertEqual(Set(r.symbols).count, 3, "비-near-miss 꽝은 셋 다 달라야 한다")
            }
        }
        XCTAssertEqual(near, Self.webNearMissDist20000.near)
        XCTAssertEqual(variantA, Self.webNearMissDist20000.variantA)
        XCTAssertEqual(hist, Self.webNearMissMatchHist20000)
        // 비율 자체도 스펙 근방 (30% / 80%).
        XCTAssertEqual(Double(near) / 20000, UpHeroSlot.nearMissRate, accuracy: 0.02)
        XCTAssertEqual(Double(variantA) / Double(near), UpHeroSlot.nearMissVariantARate, accuracy: 0.02)
    }

    /// 표시 비율은 롤 분포에 아무 영향이 없다 — 롤과 렌더를 함께 돌려도 꽝 비율은 표 그대로.
    func testNearMissRenderingDoesNotChangeRollDistribution() {
        var rng = Mulberry32(seed: 777)
        var blanks = 0
        let n = 100_000
        for _ in 0..<n {
            let o = UpHeroSlot.rollOutcome(blankStreak: 0, rng: &rng)
            _ = UpHeroSlot.render(o, rng: &rng)
            if o == .blank { blanks += 1 }
        }
        XCTAssertEqual(Double(blanks) / Double(n), 0.49, accuracy: 0.005)
    }

    func testIsNearMiss() {
        XCTAssertTrue(UpHeroSlot.isNearMiss([.gem, .gem, .coin]))    // 배치 A
        XCTAssertTrue(UpHeroSlot.isNearMiss([.gem, .coin, .gem]))    // 배치 B
        XCTAssertFalse(UpHeroSlot.isNearMiss([.coin, .gem, .gem]))   // 릴2·릴3 는 near-miss 아님 (웹 동일)
        XCTAssertFalse(UpHeroSlot.isNearMiss([.gem, .gem, .gem]))
        XCTAssertFalse(UpHeroSlot.isNearMiss([.coin, .gem, .star]))
        XCTAssertFalse(UpHeroSlot.isNearMiss([.gem, .gem]))
    }

    // MARK: - 릴 타이밍 / 축하 티어 (웹·iOS 공용 숫자)

    func testReelTimingsMatchWeb() {
        XCTAssertEqual(UpHeroSlot.reelBaseStopMs, [1080, 1240, 1400])
        XCTAssertEqual(UpHeroSlot.reelSuspenseExtraMs, 700)
        // 릴1·릴2 같음 (당첨 · near-miss A) → 릴3 +700.
        XCTAssertTrue(UpHeroSlot.hasReelSuspense([.gem, .gem, .gem]))
        XCTAssertTrue(UpHeroSlot.hasReelSuspense([.gem, .gem, .coin]))
        XCTAssertEqual(UpHeroSlot.reelTimings([.gem, .gem, .gem]), [1080, 1240, 2100])
        XCTAssertEqual(UpHeroSlot.reelTimings([.gem, .gem, .coin]), [1080, 1240, 2100])
        // 릴1·릴2 다름 (near-miss B · 일반 꽝) → 기본.
        XCTAssertFalse(UpHeroSlot.hasReelSuspense([.gem, .coin, .gem]))
        XCTAssertEqual(UpHeroSlot.reelTimings([.gem, .coin, .gem]), [1080, 1240, 1400])
        XCTAssertEqual(UpHeroSlot.reelTimings([.coin, .gem, .star]), [1080, 1240, 1400])
    }

    func testSuspenseTicksMatchWeb() {
        XCTAssertEqual(UpHeroSlot.reelSuspenseTickGapsMs, [60, 60, 65, 75, 90, 110, 135, 160, 105])
        let ticks = UpHeroSlot.suspenseTickTimes([.gem, .gem, .gem])
        XCTAssertEqual(ticks, [1300, 1360, 1425, 1500, 1590, 1700, 1835, 1995, 2100])
        XCTAssertGreaterThan(ticks[0], UpHeroSlot.reelBaseStopMs[1])
        XCTAssertEqual(ticks.last, UpHeroSlot.reelTimings([.gem, .gem, .gem])[2],
                       "마지막 틱은 릴3 착지와 겹친다")
        XCTAssertEqual(UpHeroSlot.suspenseTickTimes([.gem, .coin, .gem]), [])
    }

    func testCelebrationTierMatchesWeb() {
        for id in SlotOutcomeId.allCases {
            XCTAssertNotNil(UpHeroSlot.celebrationTier[id], "\(id.rawValue) 티어 누락")
        }
        XCTAssertEqual(UpHeroSlot.tier(.blank), .none)
        XCTAssertEqual(UpHeroSlot.tier(.coinSmall), .small)
        XCTAssertEqual(UpHeroSlot.tier(.battleBuff), .small)
        XCTAssertEqual(UpHeroSlot.tier(.coinMid), .mid)
        XCTAssertEqual(UpHeroSlot.tier(.rankProtect), .mid)
        XCTAssertEqual(UpHeroSlot.tier(.itemBox), .mid)
        let bigs = SlotOutcomeId.allCases.filter { UpHeroSlot.tier($0) == .big }
        XCTAssertEqual(Set(bigs), [.coinJackpot, .destroyProtect])
    }

    // MARK: - pity 스트릭 규칙 (웹 normalizeSlotBlankStreak / isSlotPityArmed / nextSlotBlankStreak)

    func testBlankStreakNormalization() {
        XCTAssertEqual(UpHeroSlot.blankStreakMax, 1000)
        XCTAssertEqual(UpHeroSlot.normalizeBlankStreak(nil), 0)
        XCTAssertEqual(UpHeroSlot.normalizeBlankStreak(-3), 0)
        XCTAssertEqual(UpHeroSlot.normalizeBlankStreak(4), 4)
        XCTAssertEqual(UpHeroSlot.normalizeBlankStreak(5000), 1000)
    }

    func testPityArmedExactlyAtThresholdMinusOne() {
        XCTAssertFalse(UpHeroSlot.isPityArmed(blankStreak: 0))
        XCTAssertFalse(UpHeroSlot.isPityArmed(blankStreak: UpHeroSlot.pityThreshold - 2))
        XCTAssertTrue(UpHeroSlot.isPityArmed(blankStreak: UpHeroSlot.pityThreshold - 1))
        XCTAssertTrue(UpHeroSlot.isPityArmed(blankStreak: 999))
        XCTAssertFalse(UpHeroSlot.isPityArmed(blankStreak: -1))
    }

    func testNextBlankStreak() {
        XCTAssertEqual(UpHeroSlot.nextBlankStreak(prev: 0, outcome: .blank), 1)
        XCTAssertEqual(UpHeroSlot.nextBlankStreak(prev: 3, outcome: .blank), 4)
        XCTAssertEqual(UpHeroSlot.nextBlankStreak(prev: -7, outcome: .blank), 1)
        XCTAssertEqual(UpHeroSlot.nextBlankStreak(prev: 1000, outcome: .blank), 1000)
        for id in SlotOutcomeId.allCases where id != .blank {
            XCTAssertEqual(UpHeroSlot.nextBlankStreak(prev: 4, outcome: id), 0, "\(id.rawValue) 뒤엔 0")
        }
    }

    /// 힌트와 롤이 같은 판정을 읽는다 — 힌트가 떴으면(스트릭 4) 어떤 난수에도 꽝이 없다.
    func testPityHintNeverLies() {
        let armed = UpHeroSlot.pityThreshold - 1
        XCTAssertTrue(UpHeroSlot.isPityArmed(blankStreak: armed))
        for i in 0..<400 {
            var rng = FixedRandom(values: [Double(i) / 400])
            XCTAssertNotEqual(UpHeroSlot.rollOutcome(blankStreak: armed, rng: &rng), .blank)
        }
    }

    // MARK: - 이벤트 상수

    /// prompt literal 은 `recentEventPrompts` LRU 키다. 웹과 한 글자라도 다르면
    /// 같은 계정에서 웹/iOS 가 서로 다른 LRU 를 갖는다.
    func testEventPromptMatchesWebLiteral() {
        XCTAssertEqual(
            UpHeroSlotEvent.prompt,
            "무너진 사당 안쪽, 룬이 새겨진 드럼 세 개짜리 낡은 굴림틀이 아직 돌아간다.")
        XCTAssertTrue(UpHeroSlotEvent.isSlotEvent(UpHeroSlotEvent.prompt))
        XCTAssertFalse(UpHeroSlotEvent.isSlotEvent("수상한 상인이 길을 막는다."))
        XCTAssertEqual(UpHeroSlotEvent.chance, 0.12, accuracy: 1e-12)
    }

    func testIsWin() {
        XCTAssertFalse(UpHeroSlot.isWin(.blank))
        for id in SlotOutcomeId.allCases where id != .blank {
            XCTAssertTrue(UpHeroSlot.isWin(id))
        }
    }
}
