//
//  UpHeroEnhanceTests.swift
//  UpNextTests — 강화 실패 3분기(소실/하락/유지) 재조정 + 방지권 2종.
//
//  검증 대상:
//   1. 레벨 기반 실패 결과 (구 `enhancePreserveByRarity` 고정값 퇴역).
//      currentLevel 0..2 는 소실·하락 둘 다 0 — 여기서 "+1 → +2 에서 70% 확률로
//      소실" 이라는 유저 피드백의 원인이 사라진다.
//   2. 방지권 2종 필드가 로컬 영속 / 클라우드 와이어 왕복을 모두 통과하는지.
//      (CodingKeys 누락은 조용한 데이터 손실이라 컴파일로는 안 잡힌다.)
//   3. 웹 `enhanceOutcomeRates` / `enhanceSuccessRate` / `enhanceCost` 와의 수치 일치.
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroEnhanceTests: XCTestCase {

    // MARK: - 안전 구간 (유저 피드백의 직접 대상)

    /// +0→+1 부터 +2→+3 까지는 어떤 등급이든 실패해도 소실·하락이 없다.
    func testSafeZoneHasNoDestroyOrDowngrade() {
        for rarity in Rarity.allCases {
            for level in 0...UpHeroRules.enhanceSafeMaxLevel {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                XCTAssertEqual(r.destroy, 0, "\(rarity) +\(level) 소실은 0 이어야 한다")
                XCTAssertEqual(r.down, 0, "\(rarity) +\(level) 하락은 0 이어야 한다")
                XCTAssertEqual(r.keep, 1, "\(rarity) +\(level) 는 실패해도 100% 유지")
                XCTAssertTrue(UpHeroRules.isEnhanceSafeLevel(rarity: rarity, currentLevel: level))
            }
        }
        XCTAssertEqual(UpHeroRules.enhanceSafeMaxLevel, 2)   // 웹 ENHANCE_SAFE_MAX_LEVEL
    }

    /// 구 규칙 회귀 가드 — +1 에서 실패했을 때 보존 확률이 0.3 이면 되돌아간 것이다.
    func testLowLevelIsNotOldFixedRate() {
        XCTAssertEqual(UpHeroRules.enhancePreserveRate(rarity: .normal, currentLevel: 1), 1.0)
        XCTAssertEqual(UpHeroRules.enhancePreserveRate(rarity: .legend, currentLevel: 1), 1.0)
    }

    /// 음수 레벨(손상된 저장본)도 안전 구간으로 취급 — 클램프 확인.
    func testNegativeLevelClampsToSafeZone() {
        let r = UpHeroRules.enhanceOutcomeRates(rarity: .legend, currentLevel: -3)
        XCTAssertEqual(r.keep, 1)
    }

    /// 안전 구간 바로 다음 레벨부터 소실·하락이 붙고, 레벨이 오를수록 단조 증가한다.
    func testRiskAppearsAfterSafeZoneAndGrows() {
        let firstRisky = UpHeroRules.enhanceSafeMaxLevel + 1
        for rarity in Rarity.allCases {
            XCTAssertTrue(UpHeroRules.canEnhanceDestroy(rarity: rarity, currentLevel: firstRisky))
            XCTAssertTrue(UpHeroRules.canEnhanceDowngrade(rarity: rarity, currentLevel: firstRisky))
            for level in firstRisky..<9 {
                let cur = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                let next = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level + 1)
                XCTAssertGreaterThan(next.destroy, cur.destroy,
                                     "\(rarity) +\(level) → 소실 위험이 커져야 한다")
                XCTAssertGreaterThan(next.down, cur.down,
                                     "\(rarity) +\(level) → 하락 위험이 커져야 한다")
            }
        }
    }

    /// 3분기 확률의 합은 항상 1 이다 (UI 가 keep 을 여집합으로 그려도 어긋나지 않게).
    func testOutcomeRatesAlwaysSumToOne() {
        for rarity in Rarity.allCases {
            for level in 0...12 {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                XCTAssertEqual(r.destroy + r.down + r.keep, 1.0, accuracy: 0.000001,
                               "\(rarity) +\(level)")
                XCTAssertGreaterThanOrEqual(r.keep, 0)
            }
        }
    }

    /// 상한을 넘는 레벨은 마지막 구간 값으로 고정 (배열 인덱스 초과 크래시 방지).
    func testLevelBeyondTableClampsToLast() {
        let last = UpHeroRules.enhanceOutcomeRates(rarity: .normal, currentLevel: 9)
        XCTAssertEqual(UpHeroRules.enhanceOutcomeRates(rarity: .normal, currentLevel: 99), last)
    }

    /// 등급이 높을수록 **소실**에 유리하다 (legend 는 시도 비용이 ×4 라 손실이 극단적).
    /// 하락에는 등급 보정이 없다 — 되돌릴 수 있는 손실까지 깎으면 상위 등급이 무손실이 된다.
    func testHigherRarityLosesItemLessOften() {
        let lv = 9
        let normal = UpHeroRules.enhanceDestroyRate(rarity: .normal, currentLevel: lv)
        let rare = UpHeroRules.enhanceDestroyRate(rarity: .rare, currentLevel: lv)
        let unique = UpHeroRules.enhanceDestroyRate(rarity: .unique, currentLevel: lv)
        let legend = UpHeroRules.enhanceDestroyRate(rarity: .legend, currentLevel: lv)
        XCTAssertEqual(normal, rare)                  // 웹 배율 normal=rare=1
        XCTAssertGreaterThan(rare, unique)
        XCTAssertGreaterThan(unique, legend)
        // 구 규칙(레벨 무관 legend 소실 50%)보다 최악 구간에서도 확실히 낫다.
        XCTAssertLessThan(legend, 0.5)

        for rarity in Rarity.allCases {
            XCTAssertEqual(UpHeroRules.enhanceDowngradeRate(rarity: rarity, currentLevel: lv),
                           UpHeroRules.enhanceDowngradeRate(rarity: .normal, currentLevel: lv),
                           "하락에는 등급 보정이 없어야 한다")
        }
    }

    /// 웹 `ENHANCE_DESTROY_RARITY_MULT` 와 표 값의 곱이 그대로 나와야 한다.
    /// 한쪽만 고치면 웹↔iOS 확률이 어긋난다.
    func testRatesMatchWebTables() {
        let expectedMult: [Rarity: Double] = [
            .normal: 1.0, .rare: 1.0, .unique: 0.85, .legend: 0.7,
        ]
        for (rarity, mult) in expectedMult {
            XCTAssertEqual(UpHeroRules.enhanceDestroyRarityMult[rarity], mult)
        }
        // +9→+10 : destroy 표 0.26, down 표 0.45.
        XCTAssertEqual(UpHeroRules.enhanceDestroyRate(rarity: .legend, currentLevel: 9),
                       0.26 * 0.7, accuracy: 0.000001)
        XCTAssertEqual(UpHeroRules.enhanceDowngradeRate(rarity: .legend, currentLevel: 9),
                       0.45, accuracy: 0.000001)
        // +3→+4 : 위험이 처음 붙는 계단. 소실 1%, 하락 10%.
        XCTAssertEqual(UpHeroRules.enhanceDestroyRate(rarity: .normal, currentLevel: 3),
                       0.01, accuracy: 0.000001)
        XCTAssertEqual(UpHeroRules.enhanceDowngradeRate(rarity: .normal, currentLevel: 3),
                       0.10, accuracy: 0.000001)
    }

    /// 하락 확률은 소실이 먹고 남은 확률 공간을 넘지 못한다 (합이 1 을 넘지 않게).
    func testDowngradeNeverOverflowsRemainingSpace() {
        for rarity in Rarity.allCases {
            for level in 0...12 {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                XCTAssertLessThanOrEqual(r.destroy + r.down, 1.0)
            }
        }
    }

    // MARK: - 웹 공식 일치 (개편에서 건드리지 않은 상수들)

    /// 웹 `enhanceSuccessRate` 스팟 값 (uphero.test.ts 와 같은 기준점).
    func testSuccessRateMatchesWeb() {
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .normal, currentLevel: 0), 0.95, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .rare, currentLevel: 0), 0.90, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .unique, currentLevel: 0), 0.75, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 0), 0.75, accuracy: 0.0001)
        // legend +9 = 75 - 63 = 12%
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 9), 0.12, accuracy: 0.0001)
        // 하한 5% / 상한 100%
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 99), 0.05, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 0, failStreak: 100), 1.0, accuracy: 0.0001)
        // soft pity — legend +4%p / fail
        XCTAssertEqual(
            UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 5, failStreak: 3)
                - UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 5),
            0.12, accuracy: 0.0001)
    }

    /// 웹 `enhanceCost` — base 30 × (1 + level×0.5) × rarityMult, 반올림.
    func testCostMatchesWeb() {
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .normal, currentLevel: 0), 30)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .legend, currentLevel: 0), 120)
        // 30 × 2.5 × 2.5 = 187.5 → 188 (웹 Math.round 와 같은 half-up)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .unique, currentLevel: 3), 188)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .normal, currentLevel: -5),
                       UpHeroRules.enhanceCost(rarity: .normal, currentLevel: 0))
    }

    /// 상점가·상한은 웹 `SHOP_PRICES.downGuard` / `ENHANCE_GUARD_MAX` 와 같아야 한다.
    func testGuardPriceAndCapMatchWeb() {
        XCTAssertEqual(ShopPrices.downGuard, 150)
        XCTAssertEqual(UpHeroRules.enhanceGuardMax, 99)
    }

    /// 웹 `stripEnhanceSuffix` 정규식(`/\s+\+\d*$/`) 동치.
    func testStripEnhanceSuffix() {
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("자기절제의 검 +3"), "자기절제의 검")
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("꾸준함의 방패 +"), "꾸준함의 방패")
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("평범한 검"), "평범한 검")
        // 중간의 + 는 건드리지 않는다.
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("검 +3 조각"), "검 +3 조각")
    }

    /// 웹 `pickPrimaryStatKey` — 최대값 키, 동률은 선언 순서(str→…→slotBonus).
    /// 하락 경로가 성공 경로의 역연산이 되려면 같은 키를 돌려줘야 한다.
    func testPickPrimaryStatKey() {
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey([.str: 4, .crit: 1]), .str)
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey([.crit: 9, .str: 4]), .crit)
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey([.agi: 3, .int: 3]), .int)  // 동률 → 선언 순서
        XCTAssertNil(UpHeroRules.pickPrimaryStatKey([:]))
    }

    /// 성공(짝수 레벨 primary +1) → 하락(같은 키 -1) 왕복이 닫히는지.
    /// 스토어 두 분기가 같은 규칙을 쓰는지 확인하는 대리 검증이다.
    func testStatBumpRoundTripsThroughPrimaryKey() {
        let stats: [StatKey: Int] = [.str: 4, .crit: 1]
        let primary = UpHeroRules.pickPrimaryStatKey(stats)
        XCTAssertEqual(primary, .str)
        var bumped = stats
        bumped[.str] = (bumped[.str] ?? 0) + 1
        // 성공 직후에도 같은 키가 최대값이라 역연산이 같은 키를 고른다.
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey(bumped), .str)
    }

    // MARK: - 방지권 왕복 (CodingKeys 누락 방지)

    /// 로컬 영속 스냅샷 왕복 — 앱 재시작에서 방지권이 사라지지 않는지.
    func testGuardsSurviveLocalPersistence() throws {
        var state = UpHeroStore.makeDefaultState()
        state.destroyGuards = 7
        state.downGuards = 3
        let data = try JSONEncoder().encode(PersistedUpHeroState(state))
        let restored = try JSONDecoder().decode(PersistedUpHeroState.self, from: data).toState()
        XCTAssertEqual(restored.destroyGuards, 7)
        XCTAssertEqual(restored.downGuards, 3)
    }

    /// 클라우드 와이어 왕복 — 웹↔iOS 에서 개수가 조용히 사라지지 않는지.
    /// 와이어 키는 "destroyGuards" / "downGuards" (웹과 바이트 동일).
    func testGuardsRoundTripThroughCloudWire() throws {
        var state = UpHeroStore.makeDefaultState()
        state.coins = 10
        state.destroyGuards = 4
        state.downGuards = 2

        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["destroyGuards"] as? Int, 4, "와이어 키가 빠졌다")
        XCTAssertEqual(payload["downGuards"] as? Int, 2, "와이어 키가 빠졌다")

        let data = try JSONEncoder().encode(CloudUpHeroState(state))
        let decoded = try JSONDecoder().decode(CloudUpHeroState.self, from: data)
        XCTAssertEqual(decoded.destroyGuards, 4)
        XCTAssertEqual(decoded.downGuards, 2)
        XCTAssertEqual(decoded.toState().destroyGuards, 4)
        XCTAssertEqual(decoded.toState().downGuards, 2)
    }

    /// 0 도 항상 실린다 — 키를 빼면 setDoc(merge) 가 클라우드에 남은 예전 개수를 되살려
    /// 다 쓴 방지권이 기기를 옮길 때마다 부활한다.
    func testZeroGuardsStillEncoded() throws {
        let state = UpHeroStore.makeDefaultState()
        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["destroyGuards"] as? Int, 0)
        XCTAssertEqual(payload["downGuards"] as? Int, 0)
    }

    /// 구 저장본(키 없음)은 0, 손상된 값은 클램프, legacy `protectCharms` 는
    /// 소실방지권으로 읽어준다 (단일 보호 소모품 시절 저장본 호환 — 웹과 같은 폴백).
    func testMissingBrokenAndLegacyGuardValues() throws {
        let legacy = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"coins": 5}"#.utf8))
        XCTAssertEqual(legacy.destroyGuards, 0)
        XCTAssertEqual(legacy.downGuards, 0)

        let oldKey = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"protectCharms": 3}"#.utf8))
        XCTAssertEqual(oldKey.destroyGuards, 3, "legacy protectCharms 가 증발했다")

        // 새 키가 있으면 legacy 는 무시된다.
        let both = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"protectCharms": 3, "destroyGuards": 9}"#.utf8))
        XCTAssertEqual(both.destroyGuards, 9)

        let overflow = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"destroyGuards": 99999, "downGuards": 12345}"#.utf8))
        XCTAssertEqual(overflow.destroyGuards, UpHeroRules.enhanceGuardMax)
        XCTAssertEqual(overflow.downGuards, UpHeroRules.enhanceGuardMax)

        let negative = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"destroyGuards": -4, "downGuards": -1}"#.utf8))
        XCTAssertEqual(negative.destroyGuards, 0)
        XCTAssertEqual(negative.downGuards, 0)

        let garbage = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"destroyGuards": "많이"}"#.utf8))
        XCTAssertEqual(garbage.destroyGuards, 0)
    }

    /// 방지권 보유는 그 자체로 플레이 흔적이다 (코인을 쓰거나 던전을 돌아야 생긴다).
    /// 빠지면 방지권만 가진 계정이 클라우드 복원에서 빈 값으로 덮인다.
    func testGuardsCountAsFootprint() {
        let empty = UpHeroStore.makeDefaultState()
        XCTAssertFalse(empty.hasUpHeroFootprint)

        var withDestroy = empty
        withDestroy.destroyGuards = 1
        XCTAssertTrue(withDestroy.hasUpHeroFootprint)
        XCTAssertTrue(CloudUpHeroState(withDestroy).hasFootprint)

        var withDown = empty
        withDown.downGuards = 1
        XCTAssertTrue(withDown.hasUpHeroFootprint)
        XCTAssertTrue(CloudUpHeroState(withDown).hasFootprint)
    }

    // MARK: - 상점 구매 / 지급

    /// 스토어 인스턴스를 테스트 종료 후에도 살려 둔다. @MainActor ObservableObject 를
    /// 유닛 테스트 안에서 해제하면 Swift 런타임의 MainActor deinit back-deploy 경로가
    /// libmalloc 에서 abort 한다 (이 리포지토리의 Xcode/시뮬레이터 조합에서 재현).
    /// 스토어 자체 문제가 아니라 테스트 호스트에서의 해제 타이밍 문제라, 참조를 붙들어
    /// 해제를 피한다.
    private static var sharedStore: UpHeroStore?

    @MainActor
    private func makeStore() -> UpHeroStore {
        if let s = Self.sharedStore { return s }
        let s = UpHeroStore()
        Self.sharedStore = s
        return s
    }

    /// 하락방지권만 상점 품목이다 — 소실방지권은 팔지 않는다(드롭 전용).
    func testPurchaseDownGuard() {
        let store = makeStore()
        store.resetAllData()

        XCTAssertEqual(store.purchaseDownGuard(), .noCoin)
        XCTAssertEqual(store.state.downGuards ?? 0, 0)

        store.addCoins(ShopPrices.downGuard * 2)
        XCTAssertEqual(store.purchaseDownGuard(), .ok)
        XCTAssertEqual(store.state.downGuards, 1)
        XCTAssertEqual(store.state.coins, ShopPrices.downGuard)

        XCTAssertEqual(store.purchaseDownGuard(), .ok)
        XCTAssertEqual(store.state.downGuards, 2)
        XCTAssertEqual(store.state.coins, 0)
        // 구매로는 소실방지권이 늘지 않는다.
        XCTAssertEqual(store.state.destroyGuards ?? 0, 0)

        store.resetAllData()
    }

    /// 드롭 지급 입구 — 상한을 넘는 만큼은 버리고 실제로 늘어난 수만 돌려준다.
    func testGrantEnhanceGuardsClampsAtCap() {
        let store = makeStore()
        store.resetAllData()

        let first = store.grantEnhanceGuards(destroy: 2, down: 1)
        XCTAssertEqual(first.destroy, 2)
        XCTAssertEqual(first.down, 1)
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 1)

        // 음수는 무시.
        let none = store.grantEnhanceGuards(destroy: -5)
        XCTAssertEqual(none.destroy, 0)
        XCTAssertEqual(store.state.destroyGuards, 2)

        // 상한 초과분은 버린다.
        let capped = store.grantEnhanceGuards(destroy: 500)
        XCTAssertEqual(capped.destroy, UpHeroRules.enhanceGuardMax - 2)
        XCTAssertEqual(store.state.destroyGuards, UpHeroRules.enhanceGuardMax)

        store.resetAllData()
    }
}
